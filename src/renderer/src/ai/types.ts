// ---------------------------------------------------------------------------
// Vendor-neutral tool / schema types
// ---------------------------------------------------------------------------
//
// The projection emits these from the operator registry. The gemini-client
// converts them to Gemini's specific wire format; another vendor can plug
// in their own adapter without touching the projection.

export type JsonSchemaPrimitive =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array";

export interface JsonSchemaProp {
  type: JsonSchemaPrimitive;
  description?: string;
  minimum?: number;
  maximum?: number;
  enum?: readonly string[];
  items?: { type: JsonSchemaPrimitive };
  minItems?: number;
  maxItems?: number;
  default?: unknown;
}

export interface ToolJsonSchema {
  type: "object";
  properties: Record<string, JsonSchemaProp>;
  required: string[];
}

export interface ToolDeclaration {
  /** Sanitised (no dots) — required by Gemini / OpenAI. */
  name: string;
  /** Original operator id with dots — used for dispatch. */
  operatorId: string;
  description: string;
  parameters: ToolJsonSchema;
}

export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
  /** Gemini 3+ "thought signature" — echo back on the same functionCall part. */
  thoughtSignature?: string;
}

export interface ToolResult {
  id?: string;
  name: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}
