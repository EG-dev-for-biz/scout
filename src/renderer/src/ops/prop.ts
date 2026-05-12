// ---------------------------------------------------------------------------
// PropDef — runtime property reflection
// ---------------------------------------------------------------------------
//
// One declaration per editable operator argument. A single PropDef feeds:
//   - The AI tool schema projection (JSON Schema → Gemini function decl)
//   - Runtime input validation (parsing args from chat / IPC)
//   - Default value materialisation
//
// Stripped-down adaptation of Blender's RNA. Scout3D doesn't have a
// universal datablock graph (we mutate specialised Zustand stores), so the
// `pointer` / `pointer_array` kinds from scratchbox are intentionally
// omitted — each operator references state by store + id (e.g. pin id)
// using a plain `string` prop instead.

export interface UiHints {
  label?: string;
  tooltip?: string;
  unit?: string;
  precision?: number;
  step?: number;
}

interface PropBase {
  ui?: UiHints;
}

export interface FloatProp extends PropBase {
  kind: "float";
  default: number;
  min?: number;
  max?: number;
}

export interface IntProp extends PropBase {
  kind: "int";
  default: number;
  min?: number;
  max?: number;
}

export interface BoolProp extends PropBase {
  kind: "bool";
  default: boolean;
}

export interface StringProp extends PropBase {
  kind: "string";
  default: string;
  maxLength?: number;
}

export interface Vec3Prop extends PropBase {
  kind: "vec3";
  default: readonly [number, number, number];
  /**
   *   - 'translation' → metres
   *   - 'euler'       → radians (XYZ order)
   *   - 'scale'       → dimensionless
   *   - 'color'       → linear-light RGB 0..1 (or hex via StringProp)
   *   - 'latlng_alt'  → [latitude, longitude, altitude_m]
   */
  subtype?: "translation" | "euler" | "scale" | "color" | "latlng_alt";
  min?: number;
  max?: number;
}

export interface EnumProp<T extends string = string> extends PropBase {
  kind: "enum";
  default: T;
  values: ReadonlyArray<{ id: T; label?: string; description?: string }>;
}

export type PropDef =
  | FloatProp
  | IntProp
  | BoolProp
  | StringProp
  | Vec3Prop
  | EnumProp;

export type StructDef = Record<string, PropDef>;

/** Resolve a PropDef's TS runtime type. */
export type PropValue<P extends PropDef> = P extends FloatProp
  ? number
  : P extends IntProp
    ? number
    : P extends BoolProp
      ? boolean
      : P extends StringProp
        ? string
        : P extends Vec3Prop
          ? [number, number, number]
          : P extends EnumProp<infer V>
            ? V
            : never;

export type StructValue<S extends StructDef> = {
  [K in keyof S]: PropValue<S[K]>;
};

/** Materialise defaults from a StructDef. */
export function defaultStruct<S extends StructDef>(def: S): StructValue<S> {
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(def)) {
    out[key] = defaultProp(prop);
  }
  return out as StructValue<S>;
}

export function defaultProp(prop: PropDef): unknown {
  switch (prop.kind) {
    case "float":
    case "int":
    case "bool":
    case "string":
    case "enum":
      return prop.default;
    case "vec3":
      return [prop.default[0], prop.default[1], prop.default[2]];
  }
}
