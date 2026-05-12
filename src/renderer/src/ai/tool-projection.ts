import type { OperatorRegistry } from "@/ops/registry";
import type { OperatorDef } from "@/ops/types";
import type { PropDef, StructDef } from "@/ops/prop";
import type { JsonSchemaProp, ToolDeclaration, ToolJsonSchema } from "./types";

/**
 * Project the operator registry into vendor-neutral tool declarations.
 * One declaration per non-internal operator. Read-only / undoable flags
 * are appended to the description because Gemini's planning measurably
 * improves when it knows whether a tool mutates state.
 *
 * The headline property of this function: every operator we register is
 * automatically AI-callable. There is NO hand-maintained tool catalogue.
 * Adding a button → AI gets the tool. Removing a button → AI loses it.
 */
export function toAITools(registry: OperatorRegistry): ToolDeclaration[] {
  return registry
    .list()
    .filter((op) => !op.flags.internal)
    .map(operatorToTool);
}

export function operatorToTool(op: OperatorDef): ToolDeclaration {
  return {
    name: sanitiseName(op.id),
    operatorId: op.id,
    description: composeDescription(op),
    parameters: structDefToSchema(op.props),
  };
}

/** Gemini / OpenAI forbid dots in tool names. */
export function sanitiseName(operatorId: string): string {
  return operatorId.replace(/\./g, "_");
}

function composeDescription(op: OperatorDef): string {
  const flags: string[] = [];
  if (op.flags.readonly) flags.push("read-only");
  if (op.flags.undo) flags.push("undoable");
  const tail = flags.length ? ` (${flags.join(", ")})` : "";
  return `${op.description}${tail}`;
}

export function structDefToSchema(struct: StructDef): ToolJsonSchema {
  const properties: Record<string, JsonSchemaProp> = {};
  for (const [name, prop] of Object.entries(struct)) {
    properties[name] = propToSchema(prop, name);
  }
  // Phase 0: nothing is "required" — every prop has a default. Matches
  // Blender's default-driven operator model and lets the AI take terse
  // shots without filling every field.
  return { type: "object", properties, required: [] };
}

export function propToSchema(prop: PropDef, name: string): JsonSchemaProp {
  const description = composePropDescription(prop, name);

  switch (prop.kind) {
    case "float":
      return {
        type: "number",
        description,
        ...(prop.min !== undefined ? { minimum: prop.min } : {}),
        ...(prop.max !== undefined ? { maximum: prop.max } : {}),
        default: prop.default,
      };
    case "int":
      return {
        type: "integer",
        description,
        ...(prop.min !== undefined ? { minimum: prop.min } : {}),
        ...(prop.max !== undefined ? { maximum: prop.max } : {}),
        default: prop.default,
      };
    case "bool":
      return { type: "boolean", description, default: prop.default };
    case "string":
      return { type: "string", description, default: prop.default };
    case "vec3": {
      const subtypeHint =
        prop.subtype === "translation"
          ? "A 3-element [x, y, z] vector in metres."
          : prop.subtype === "euler"
            ? "A 3-element [x, y, z] euler rotation in radians."
            : prop.subtype === "color"
              ? "A 3-element [r, g, b] color, each channel 0..1, linear-light."
              : prop.subtype === "scale"
                ? "A 3-element [sx, sy, sz] scale factor."
                : prop.subtype === "latlng_alt"
                  ? "A 3-element [latitude_deg, longitude_deg, altitude_m]."
                  : "A 3-element numeric vector.";
      return {
        type: "array",
        items: { type: "number" },
        minItems: 3,
        maxItems: 3,
        description: `${subtypeHint} ${description ?? ""}`.trim(),
        default: [...prop.default] as number[],
      };
    }
    case "enum":
      return {
        type: "string",
        enum: prop.values.map((v) => v.id),
        description: composeEnumDescription(prop, description),
        default: prop.default,
      };
  }
}

function composePropDescription(prop: PropDef, name: string): string {
  const ui = prop.ui ?? {};
  const label = ui.label ?? name;
  const tooltip = ui.tooltip ?? "";
  const unit = ui.unit ? ` (${ui.unit})` : "";
  return tooltip ? `${tooltip}${unit}` : `${label}${unit}`;
}

function composeEnumDescription(
  prop: Extract<PropDef, { kind: "enum" }>,
  base: string,
): string {
  const optionDocs = prop.values
    .map((v) => {
      if (v.description) return `${v.id}: ${v.description}`;
      if (v.label) return `${v.id} (${v.label})`;
      return v.id;
    })
    .join("; ");
  return `${base} Options: ${optionDocs}.`;
}
