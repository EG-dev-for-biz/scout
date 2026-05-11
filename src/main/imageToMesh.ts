// imageToMesh.ts
//
// Owns the long-lived Python process that runs Stable-Fast-3D on the
// user's machine and turns 2D images into GLB meshes. Each Scout3D
// session spawns one Python child the first time a generation is
// requested, then reuses it for subsequent jobs so we don't pay the
// ~10s model-load cost more than once per session.
//
// External shape (consumed by ipc.ts):
//   meshGenerator.isInstalled()
//   meshGenerator.generate({ imageDataUrl, projectId, jobId }) → glbPath
//   meshGenerator.cancel()
//   meshGenerator.on("progress", fn) / .off
//
// Wire protocol with the Python child (newline-delimited JSON) is
// documented in scripts/sf3d_cli.py.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Paths ────────────────────────────────────────────────────────────────

const SCOUT3D_HOME = join(homedir(), ".scout3d");
const SF3D_HOME = join(SCOUT3D_HOME, "sf3d");
const PY_BIN = join(SF3D_HOME, ".venv", "bin", "python");
const CLI_PATH = join(SF3D_HOME, "sf3d_cli.py");
const INSTALL_MARKER = join(SF3D_HOME, ".installed");

const PROJECTS_ROOT = join(SCOUT3D_HOME, "projects");
const TMP_DIR = join(SCOUT3D_HOME, "tmp");

// ─── Public types ─────────────────────────────────────────────────────────

export interface GenerateArgs {
  /** PNG or JPEG payload as a data URL or raw base64. */
  imageDataUrl: string;
  /** Stable project identifier — used as the on-disk folder for outputs. */
  projectId: string;
  /** Client-supplied id so progress events can be correlated. */
  jobId: string;
  /** Default true. Disable when the source image is already pre-cropped. */
  removeBg?: boolean;
  /** Default 1024. Lower (512) for faster previs props. */
  textureResolution?: number;
}

export interface GenerateResult {
  jobId: string;
  glbPath: string;
  elapsedMs: number;
}

export interface ProgressEvent {
  jobId: string;
  pct: number;
  step: string;
}

export interface InstallStatus {
  installed: boolean;
  pythonExists: boolean;
  cliExists: boolean;
  sf3dHome: string;
}

// ─── Generator class ──────────────────────────────────────────────────────

class MeshGenerator extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  /** Resolves when the child writes its initial {"kind":"ready"}. */
  private readyPromise: Promise<void> | null = null;
  /** The currently-running job (one at a time). */
  private current: {
    args: GenerateArgs;
    outPath: string;
    resolve: (r: GenerateResult) => void;
    reject: (err: Error) => void;
    startedAt: number;
  } | null = null;
  /** Partial line buffer for stdout — JSON events are newline-delimited. */
  private stdoutBuf = "";

  // ─── Install status ─────────────────────────────────────────────────────

  isInstalled(): InstallStatus {
    return {
      installed: existsSync(INSTALL_MARKER),
      pythonExists: existsSync(PY_BIN),
      cliExists: existsSync(CLI_PATH),
      sf3dHome: SF3D_HOME,
    };
  }

  // ─── Process lifecycle ──────────────────────────────────────────────────

  private ensureProcess(): Promise<void> {
    if (this.proc && this.readyPromise) return this.readyPromise;
    if (!this.isInstalled().installed) {
      return Promise.reject(
        new Error(
          `SF3D is not installed. Run scripts/install-sf3d.sh first ` +
            `(expected marker at ${INSTALL_MARKER}).`
        )
      );
    }

    this.proc = spawn(PY_BIN, [CLI_PATH], {
      env: {
        ...process.env,
        PYTORCH_ENABLE_MPS_FALLBACK: "1",
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout.setEncoding("utf-8");
    this.proc.stderr.setEncoding("utf-8");

    this.proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    this.proc.stderr.on("data", (chunk: string) => {
      // Python stderr is just diagnostic; forward as log events.
      const trimmed = chunk.trim();
      if (trimmed) this.emit("log", trimmed);
    });

    this.proc.on("exit", (code, signal) => {
      const wasRunning = this.current !== null;
      this.proc = null;
      this.readyPromise = null;
      this.stdoutBuf = "";
      if (this.current) {
        this.current.reject(
          new Error(
            `SF3D process exited unexpectedly (code=${code}, signal=${signal})`
          )
        );
        this.current = null;
      }
      this.emit("exit", { code, signal, wasRunning });
    });

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const onReady = () => {
        this.off("__ready__", onReady);
        this.off("__readyError__", onErr);
        resolve();
      };
      const onErr = (err: Error) => {
        this.off("__ready__", onReady);
        this.off("__readyError__", onErr);
        reject(err);
      };
      this.on("__ready__", onReady);
      this.on("__readyError__", onErr);
    });

    return this.readyPromise;
  }

  private onStdout(chunk: string): void {
    this.stdoutBuf += chunk;
    let nl: number;
    while ((nl = this.stdoutBuf.indexOf("\n")) !== -1) {
      const line = this.stdoutBuf.slice(0, nl).trim();
      this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
      if (line) this.handleEvent(line);
    }
  }

  private handleEvent(line: string): void {
    let evt: any;
    try {
      evt = JSON.parse(line);
    } catch {
      // Python printed something un-tagged — forward as log.
      this.emit("log", line);
      return;
    }

    switch (evt.kind) {
      case "ready":
        this.emit("__ready__");
        return;

      case "pong":
        this.emit("pong");
        return;

      case "progress": {
        const p: ProgressEvent = {
          jobId: String(evt.jobId ?? ""),
          pct: Number(evt.pct ?? 0),
          step: String(evt.step ?? ""),
        };
        this.emit("progress", p);
        return;
      }

      case "done": {
        const job = this.current;
        if (!job || job.args.jobId !== evt.jobId) {
          this.emit("log", `Stray done event for jobId=${evt.jobId}`);
          return;
        }
        this.current = null;
        job.resolve({
          jobId: job.args.jobId,
          glbPath: String(evt.outPath ?? job.outPath),
          elapsedMs: Number(evt.elapsedMs ?? Date.now() - job.startedAt),
        });
        return;
      }

      case "error": {
        const msg = String(evt.message ?? "Unknown error");
        const job = this.current;
        if (job && (!evt.jobId || evt.jobId === job.args.jobId)) {
          this.current = null;
          job.reject(new Error(msg));
        } else {
          // No active job — likely a startup-time failure.
          this.emit("__readyError__", new Error(msg));
        }
        if (evt.traceback) this.emit("log", String(evt.traceback));
        return;
      }

      case "log":
        this.emit("log", String(evt.message ?? ""));
        return;

      default:
        this.emit("log", `Unknown event kind: ${evt.kind}`);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  async generate(args: GenerateArgs): Promise<GenerateResult> {
    if (this.current) {
      throw new Error(
        "Another mesh generation is already in flight. Cancel it first."
      );
    }

    await this.ensureProcess();

    // Decode data-url / raw base64 into a temp PNG. SF3D's I/O is path-based.
    mkdirSync(TMP_DIR, { recursive: true });
    const inPath = join(TMP_DIR, `${args.jobId}.png`);
    const base64 = stripDataUrlPrefix(args.imageDataUrl);
    writeFileSync(inPath, Buffer.from(base64, "base64"));

    const projectDir = join(PROJECTS_ROOT, args.projectId, "objects");
    mkdirSync(projectDir, { recursive: true });
    const outPath = join(projectDir, `${args.jobId}.glb`);

    return new Promise<GenerateResult>((resolve, reject) => {
      this.current = {
        args,
        outPath,
        resolve,
        reject,
        startedAt: Date.now(),
      };
      const req = {
        op: "generate",
        jobId: args.jobId,
        imagePath: inPath,
        outPath,
        removeBg: args.removeBg ?? true,
        textureResolution: args.textureResolution ?? 1024,
      };
      try {
        this.proc!.stdin.write(JSON.stringify(req) + "\n");
      } catch (err) {
        this.current = null;
        reject(err as Error);
      }
    });
  }

  cancel(): void {
    // SF3D's inference can't be cooperatively cancelled mid-step on MPS,
    // so we SIGTERM the child. Next generate() spins a fresh one up.
    if (!this.proc) return;
    const current = this.current;
    this.proc.kill("SIGTERM");
    if (current) {
      this.current = null;
      current.reject(new Error("Cancelled by user"));
    }
  }

  async shutdown(): Promise<void> {
    if (!this.proc) return;
    return new Promise((resolve) => {
      this.proc?.once("exit", () => resolve());
      this.proc?.kill("SIGTERM");
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function stripDataUrlPrefix(input: string): string {
  const comma = input.indexOf(",");
  if (input.startsWith("data:") && comma !== -1) {
    return input.slice(comma + 1);
  }
  return input;
}

// ─── Singleton ────────────────────────────────────────────────────────────

export const meshGenerator = new MeshGenerator();

export { PROJECTS_ROOT };
