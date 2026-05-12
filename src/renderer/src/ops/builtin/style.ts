import { defineOperator } from "../define";
import type { EnumProp } from "../prop";
import { STYLE_PRESETS, useStyleStore } from "@/state/styleStore";
import { RENDER_MODE_OPTIONS, useRenderModeStore, type RenderMode } from "@/state/renderModeStore";
import { useViewportStore, ASPECT_RATIO_OPTIONS, type AspectRatio } from "@/state/viewportStore";

/**
 * `style.set_active` — apply a built-in StyleProfile (Realistic,
 * Pixar Daytime, Arcane Twilight, Wes Anderson, Spider-Verse, Film
 * Noir, Ghibli, Cyberpunk). Each profile carries materials, sky,
 * lighting, and post-FX.
 */
export const SetActiveStyleOp = defineOperator({
  id: "style.set_active",
  label: "Set Style",
  description:
    "Apply a built-in visual style profile. Each profile coherently sets materials, sky / lighting, post-processing, and a creative palette. Use this BEFORE per-knob tweaks.",
  flags: { undo: true },
  props: {
    id: {
      kind: "enum",
      default: "realistic",
      values: STYLE_PRESETS.map((p) => ({
        id: p.id,
        label: p.name,
        description: p.description,
      })),
      ui: { tooltip: "Style profile id." },
    } as EnumProp<string>,
  },
  exec(_ctx, props) {
    useStyleStore.getState().setActiveById(props.id);
    return { status: "finished", value: { applied: props.id } };
  },
});

export const SetRenderModeOp = defineOperator({
  id: "render.set_mode",
  label: "Set Render Mode",
  description:
    "Switch between OSM-extruded buildings, Google Photorealistic 3D Tiles, and hybrid (tiles + clickable OSM hit-targets).",
  flags: { undo: true },
  props: {
    mode: {
      kind: "enum",
      default: "osm",
      values: RENDER_MODE_OPTIONS.map((o) => ({
        id: o.id,
        label: o.label,
        description: o.description + (o.requiresGoogle ? " (Google API key required)" : ""),
      })),
      ui: { tooltip: "Rendering backend." },
    } as EnumProp<RenderMode>,
  },
  exec(_ctx, props) {
    useRenderModeStore.getState().setMode(props.mode);
    return { status: "finished" };
  },
});

export const SetAspectRatioOp = defineOperator({
  id: "viewport.set_aspect_ratio",
  label: "Set Aspect Ratio",
  description:
    "Letterbox / pillarbox the viewport to a cinematic aspect ratio (e.g. 16:9, 2.39:1 anamorphic). Use 'free' to fill the available space.",
  flags: { undo: true },
  props: {
    ratio: {
      kind: "enum",
      default: "free",
      values: ASPECT_RATIO_OPTIONS.map((o) => ({
        id: o.id,
        label: o.label,
        description: o.description,
      })),
      ui: { tooltip: "Aspect ratio preset." },
    } as EnumProp<AspectRatio>,
  },
  exec(_ctx, props) {
    useViewportStore.getState().setAspectRatio(props.ratio);
    return { status: "finished" };
  },
});
