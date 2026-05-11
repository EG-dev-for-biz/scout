// useImageToMesh.ts
//
// Thin React layer over window.api.mesh.*. Tracks a single in-flight
// generation, subscribes to progress events for the duration of that
// job, and turns the absolute on-disk path returned by the main
// process into a scout3d-asset:// URL the renderer can consume.

import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";

export type MeshInstallStatus = {
  installed: boolean;
  pythonExists: boolean;
  cliExists: boolean;
  sf3dHome: string;
};

export interface UseImageToMesh {
  /** True while a job is running. */
  generating: boolean;
  /** 0–100. */
  progress: number;
  /** Human-readable current step (e.g. "Running diffusion"). */
  step: string;
  /** Most recent error message, cleared on a new generate(). */
  error: string | null;
  /** Most recent successful job. */
  result: {
    glbUrl: string;
    glbAbsolutePath: string;
    elapsedMs: number;
  } | null;
  /**
   * Kick off a generation. Returns the scout3d-asset:// URL on success,
   * or null on cancel/error (error is set on the hook state).
   */
  generate: (opts: {
    imageDataUrl: string;
    removeBg?: boolean;
    textureResolution?: number;
  }) => Promise<string | null>;
  cancel: () => void;
}

function newJobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Given an absolute path under ~/.scout3d/projects/<projectId>/...,
 * return the matching scout3d-asset:// URL. Falls back to file:// if
 * the path doesn't match the expected layout (shouldn't happen, but
 * keeps the hook honest if the main process ever returns something
 * outside the project root).
 */
function pathToAssetUrl(absPath: string, projectId: string): string {
  const sep = absPath.includes("\\") ? "\\" : "/";
  const marker = `${sep}.scout3d${sep}projects${sep}${projectId}${sep}`;
  const idx = absPath.indexOf(marker);
  if (idx === -1) {
    return `file://${absPath}`;
  }
  const rel = absPath.slice(idx + marker.length).replace(/\\/g, "/");
  return `scout3d-asset://${projectId}/${rel}`;
}

/** One-shot probe used by the modal to decide if we should show the
 *  "Install SF3D first" path. */
export function useMeshInstallStatus(): MeshInstallStatus | null {
  const [status, setStatus] = useState<MeshInstallStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    window.api.mesh.checkInstall().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

export function useImageToMesh(): UseImageToMesh {
  const projectId = useProjectStore((s) => s.projectId);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UseImageToMesh["result"]>(null);

  const activeJobIdRef = useRef<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Tear down any lingering subscription on unmount.
  useEffect(
    () => () => {
      unsubRef.current?.();
      unsubRef.current = null;
    },
    []
  );

  const generate = useCallback<UseImageToMesh["generate"]>(
    async ({ imageDataUrl, removeBg = true, textureResolution = 1024 }) => {
      if (generating) {
        setError("Another generation is already in flight.");
        return null;
      }

      const jobId = newJobId();
      activeJobIdRef.current = jobId;

      setGenerating(true);
      setProgress(0);
      setStep("Submitting");
      setError(null);
      setResult(null);

      // Subscribe to progress for this specific job. The IPC channel is
      // broadcast to all windows so we filter by jobId.
      unsubRef.current?.();
      unsubRef.current = window.api.mesh.onProgress((p) => {
        if (p.jobId !== jobId) return;
        setProgress(p.pct);
        setStep(p.step);
      });

      try {
        const res = await window.api.mesh.generate({
          imageDataUrl,
          projectId,
          jobId,
          removeBg,
          textureResolution,
        });

        if (activeJobIdRef.current !== jobId) {
          // Cancelled while in flight — the cancel() path already cleared state.
          return null;
        }

        if (res.success === true) {
          const glbUrl = pathToAssetUrl(res.glbPath, projectId);
          setResult({
            glbUrl,
            glbAbsolutePath: res.glbPath,
            elapsedMs: res.elapsedMs,
          });
          setProgress(100);
          setStep("Done");
          setGenerating(false);
          return glbUrl;
        }

        setError(res.error);
        setGenerating(false);
        setStep("");
        return null;
      } catch (err) {
        setError(String((err as Error).message ?? err));
        setGenerating(false);
        setStep("");
        return null;
      } finally {
        if (activeJobIdRef.current === jobId) {
          activeJobIdRef.current = null;
        }
        unsubRef.current?.();
        unsubRef.current = null;
      }
    },
    [generating, projectId]
  );

  const cancel = useCallback(() => {
    if (!generating) return;
    activeJobIdRef.current = null;
    window.api.mesh.cancel();
    setGenerating(false);
    setStep("");
    setError("Cancelled");
  }, [generating]);

  return { generating, progress, step, error, result, generate, cancel };
}
