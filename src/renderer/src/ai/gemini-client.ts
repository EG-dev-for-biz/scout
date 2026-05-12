// ---------------------------------------------------------------------------
// Direct Gemini streaming client (renderer-side)
// ---------------------------------------------------------------------------
//
// Talks straight to Google's `streamGenerateContent` API using the
// `VITE_GEMINI_API_KEY` already set in `.env.local`. No backend hop.
//
// Same `streamTurn(req, signal)` async-iterable shape that scratchbox
// uses, so a Bridge / proxy transport can drop in later without touching
// the agent loop or chat UI.
//
// Security note: VITE_* env vars are inlined into the renderer bundle.
// Don't distribute builds with the key set — for production, move the
// key into Electron main and stream through an IPC bridge.

import type { Message } from "./messages";
import type { JsonSchemaProp, ToolCall, ToolDeclaration, ToolJsonSchema } from "./types";

export interface AgentRequest {
  system?: string;
  messages: Message[];
  tools: ToolDeclaration[];
}

export type AgentEvent =
  | { kind: "text"; delta: string }
  | { kind: "tool_call"; call: ToolCall }
  | { kind: "end"; reason: "stop" | "tool_calls" | "max_tokens" | "error" }
  | { kind: "error"; message: string };

export interface AgentClientLike {
  streamTurn(req: AgentRequest, signal?: AbortSignal): AsyncGenerator<AgentEvent>;
}

export interface GeminiClientOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  apiBase?: string;
}

const DEFAULT_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Gemini 2.5 Flash — fast + cheap + tool-calling capable. Override via
// the chat panel's settings or a constructor option when iterating.
const DEFAULT_MODEL = "gemini-2.5-flash";

export class GeminiClient implements AgentClientLike {
  private readonly opts: GeminiClientOptions;

  constructor(opts: GeminiClientOptions) {
    this.opts = opts;
  }

  async *streamTurn(req: AgentRequest, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const fetchFn = this.opts.fetch ?? fetch;
    const model = this.opts.model ?? DEFAULT_MODEL;
    const apiBase = this.opts.apiBase ?? DEFAULT_API_BASE;
    const url = `${apiBase}/models/${encodeURIComponent(
      model,
    )}:streamGenerateContent?key=${encodeURIComponent(this.opts.apiKey)}&alt=sse`;

    const body = buildGeminiRequest(req);

    let response: Response;
    try {
      response = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      yield { kind: "error", message: `Network error: ${(err as Error).message}` };
      yield { kind: "end", reason: "error" };
      return;
    }

    if (!response.ok || !response.body) {
      const text = await safeText(response);
      yield {
        kind: "error",
        message: `Gemini API HTTP ${response.status}: ${text || response.statusText}`,
      };
      yield { kind: "end", reason: "error" };
      return;
    }

    yield* parseGeminiStream(response.body);
  }
}

/* -------------------- Request building -------------------- */

interface GeminiContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  thoughtSignature?: string;
  functionResponse?: { name: string; response: { result: unknown } };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiContentPart[];
}

interface GeminiSchema {
  type:
    | "TYPE_UNSPECIFIED"
    | "STRING"
    | "NUMBER"
    | "INTEGER"
    | "BOOLEAN"
    | "ARRAY"
    | "OBJECT";
  description?: string;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  default?: unknown;
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: GeminiSchema;
}

interface GeminiRequestBody {
  contents: GeminiContent[];
  systemInstruction?: { parts: Array<{ text: string }> };
  tools?: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>;
  toolConfig?: { functionCallingConfig: { mode: "AUTO" | "ANY" | "NONE" } };
}

export function buildGeminiRequest(req: AgentRequest): GeminiRequestBody {
  const body: GeminiRequestBody = {
    contents: messagesToGeminiContents(req.messages),
  };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
  if (req.tools.length > 0) {
    body.tools = [{ functionDeclarations: req.tools.map(toGeminiTool) }];
    body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }
  return body;
}

function toGeminiTool(decl: ToolDeclaration): GeminiFunctionDeclaration {
  return {
    name: decl.name,
    description: decl.description,
    parameters: schemaToGemini(decl.parameters),
  };
}

function schemaToGemini(schema: ToolJsonSchema): GeminiSchema {
  const properties: Record<string, GeminiSchema> = {};
  for (const [name, prop] of Object.entries(schema.properties)) {
    properties[name] = propToGemini(prop);
  }
  return { type: "OBJECT", properties, required: schema.required };
}

function propToGemini(prop: JsonSchemaProp): GeminiSchema {
  const out: GeminiSchema = { type: jsonTypeToGemini(prop.type) };
  if (prop.description !== undefined) out.description = prop.description;
  if (prop.minimum !== undefined) out.minimum = prop.minimum;
  if (prop.maximum !== undefined) out.maximum = prop.maximum;
  if (prop.enum !== undefined) out.enum = [...prop.enum];
  if (prop.minItems !== undefined) out.minItems = prop.minItems;
  if (prop.maxItems !== undefined) out.maxItems = prop.maxItems;
  if (prop.items !== undefined) out.items = { type: jsonTypeToGemini(prop.items.type) };
  if (prop.default !== undefined) out.default = prop.default;
  return out;
}

function jsonTypeToGemini(t: JsonSchemaProp["type"]): GeminiSchema["type"] {
  switch (t) {
    case "string":
      return "STRING";
    case "number":
      return "NUMBER";
    case "integer":
      return "INTEGER";
    case "boolean":
      return "BOOLEAN";
    case "array":
      return "ARRAY";
  }
}

/**
 * Convert our Message[] to Gemini's `Content[]`. system messages are
 * lifted to `systemInstruction` upstream and skipped here. Consecutive
 * same-role messages merge into one Content block — Gemini rejects
 * malformed sequences otherwise.
 */
export function messagesToGeminiContents(messages: ReadonlyArray<Message>): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;
    const role: GeminiContent["role"] = msg.role === "assistant" ? "model" : "user";
    const parts: GeminiContentPart[] = [];

    if (msg.role === "user") {
      parts.push({ text: msg.content });
      if (msg.imageDataUrl) {
        const match = msg.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (match && match[1] && match[2]) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      }
    } else if (msg.role === "assistant") {
      if (msg.content) parts.push({ text: msg.content });
      if (msg.toolCalls) {
        for (const call of msg.toolCalls) {
          const p: GeminiContentPart = {
            functionCall: { name: call.name, args: call.args },
          };
          if (call.thoughtSignature !== undefined) {
            p.thoughtSignature = call.thoughtSignature;
          }
          parts.push(p);
        }
      }
    } else {
      parts.push({
        functionResponse: {
          name: msg.toolName,
          response: {
            result: msg.result.ok ? msg.result.value : { error: msg.result.error },
          },
        },
      });
    }

    if (parts.length === 0) continue;
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts.push(...parts);
    } else {
      contents.push({ role, parts });
    }
  }
  return contents;
}

/* -------------------- Stream parsing -------------------- */

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      role?: string;
      parts?: Array<
        GeminiContentPart & {
          /** Some responses use snake_case in JSON. */
          thought_signature?: string;
        }
      >;
    };
    finishReason?: string;
  }>;
}

export async function* parseGeminiStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AgentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let sawFunctionCall = false;
  let finishReason: string | null = null;
  let toolCallSeq = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;

      let parsed: GeminiStreamChunk;
      try {
        parsed = JSON.parse(payload) as GeminiStreamChunk;
      } catch {
        continue;
      }
      const candidate = parsed.candidates?.[0];
      if (!candidate) continue;

      for (const part of candidate.content?.parts ?? []) {
        if (typeof part.text === "string" && part.text.length > 0) {
          yield { kind: "text", delta: part.text };
        } else if (part.functionCall) {
          sawFunctionCall = true;
          const sig =
            part.thoughtSignature !== undefined
              ? part.thoughtSignature
              : (part as { thought_signature?: string }).thought_signature;
          const call: ToolCall = {
            id: `call-${++toolCallSeq}`,
            name: part.functionCall.name,
            args: part.functionCall.args ?? {},
            ...(sig !== undefined ? { thoughtSignature: sig } : {}),
          };
          yield { kind: "tool_call", call };
        }
      }
      if (candidate.finishReason) finishReason = candidate.finishReason;
    }
  }
  yield { kind: "end", reason: mapFinishReason(finishReason, sawFunctionCall) };
}

function mapFinishReason(
  reason: string | null,
  sawFunctionCall: boolean,
): "stop" | "tool_calls" | "max_tokens" | "error" {
  if (sawFunctionCall) return "tool_calls";
  if (reason === "MAX_TOKENS") return "max_tokens";
  if (reason === "STOP" || reason === null) return "stop";
  return "error";
}

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text();
  } catch {
    return "";
  }
}
