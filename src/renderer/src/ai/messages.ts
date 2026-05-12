import type { ToolCall, ToolResult } from "./types";

/**
 * Canonical chat message format. Vendor-specific shapes (Gemini Content[],
 * OpenAI messages[]) are mapped from this at the wire boundary.
 */
export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

export interface SystemMessage {
  role: "system";
  content: string;
}

export interface UserMessage {
  role: "user";
  content: string;
  /** Optional base64 PNG / JPEG / WEBP attached to the message. */
  imageDataUrl?: string;
}

export interface AssistantMessage {
  role: "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolMessage {
  role: "tool";
  toolCallId?: string;
  toolName: string;
  result: ToolResult;
}

export function userMessage(content: string, imageDataUrl?: string): UserMessage {
  const msg: UserMessage = { role: "user", content };
  if (imageDataUrl) msg.imageDataUrl = imageDataUrl;
  return msg;
}

export function systemMessage(content: string): SystemMessage {
  return { role: "system", content };
}

export function assistantMessage(content: string, toolCalls?: ToolCall[]): AssistantMessage {
  const msg: AssistantMessage = { role: "assistant", content };
  if (toolCalls && toolCalls.length > 0) msg.toolCalls = toolCalls;
  return msg;
}

export function toolMessage(
  toolName: string,
  result: ToolResult,
  toolCallId?: string,
): ToolMessage {
  const msg: ToolMessage = { role: "tool", toolName, result };
  if (toolCallId !== undefined) msg.toolCallId = toolCallId;
  return msg;
}
