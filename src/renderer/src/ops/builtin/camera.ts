import { defineOperator } from "../define";
import type { EnumProp } from "../prop";
import {
  LENS_PRESETS,
  useCameraStore,
  fovToFocalLength,
} from "@/state/cameraStore";
import { useAnnotationStore } from "@/state/annotationStore";

/**
 * `camera.set_lens` — pick a cinematographer-friendly focal length.
 *
 * Driven by the same `LENS_PRESETS` table the LensPicker UI uses, so
 * "give me a 35mm look" and the user clicking 35mm in the dial behave
 * identically.
 */
export const SetLensOp = defineOperator({
  id: "camera.set_lens",
  label: "Set Lens",
  description:
    "Set the active camera lens by 35mm-equivalent focal length. Use a preset id to mirror the in-app LensPicker, or pass `custom_mm` for an arbitrary value.",
  flags: { undo: true },
  props: {
    preset: {
      kind: "enum",
      default: "35mm",
      values: [
        ...LENS_PRESETS.map((p) => ({
          id: p.label,
          description: `${p.focalMM}mm — ${p.description}`,
        })),
        { id: "custom", description: "Use the `custom_mm` value." },
      ],
      ui: { tooltip: "Lens preset, or 'custom' to use `custom_mm`." },
    } as EnumProp<string>,
    custom_mm: {
      kind: "float",
      default: 35,
      min: 8,
      max: 600,
      ui: { unit: "mm", tooltip: "Custom 35mm-equivalent focal length (only used when preset='custom')." },
    },
  },
  exec(_ctx, props) {
    let focalMM = props.custom_mm;
    if (props.preset !== "custom") {
      const match = LENS_PRESETS.find((p) => p.label === props.preset);
      if (match) focalMM = match.focalMM;
    }
    useCameraStore.getState().setLensFocalMM(focalMM);
    return { status: "finished", value: { focalMM } };
  },
});

export const SetApertureOp = defineOperator({
  id: "camera.set_aperture",
  label: "Set Aperture",
  description:
    "Set the camera aperture (f-stop). Lower numbers (f/1.4..f/2.8) = shallow depth of field; higher (f/8..f/16) = deep focus. Requires DoF enabled to affect rendering.",
  flags: { undo: true },
  props: {
    f_stop: {
      kind: "float",
      default: 2.8,
      min: 1,
      max: 22,
      ui: { tooltip: "F-stop (1.0..22)." },
    },
  },
  exec(_ctx, props) {
    useCameraStore.getState().setApertureF(props.f_stop);
    return { status: "finished" };
  },
});

export const SetDofOp = defineOperator({
  id: "camera.set_dof",
  label: "Set Depth of Field",
  description:
    "Enable or disable the depth-of-field post-effect. Pair with `camera.set_aperture` to control how aggressive the blur is.",
  flags: { undo: true },
  props: {
    enabled: { kind: "bool", default: true, ui: { tooltip: "Whether DoF is on." } },
  },
  exec(_ctx, props) {
    useCameraStore.getState().setDofEnabled(props.enabled);
    return { status: "finished" };
  },
});

/**
 * `camera.frame_pin` — recall a shot pin's saved camera. Equivalent to
 * the user clicking a shot in the Filmstrip or pressing `[` / `]`.
 */
export const FramePinOp = defineOperator({
  id: "camera.frame_pin",
  label: "Frame Pin",
  description:
    "Tween the camera to a saved Shot pin's framing. Find pin ids via `scene.list_pins`.",
  flags: { undo: false },
  props: {
    pin_id: {
      kind: "string",
      default: "",
      ui: { tooltip: "The id of the pin to frame. Get ids from scene.list_pins." },
    },
  },
  exec(_ctx, props) {
    if (!props.pin_id) {
      return { status: "error", message: "pin_id is required." };
    }
    const pin = useAnnotationStore.getState().pins.find((p) => p.id === props.pin_id);
    if (!pin) return { status: "cancelled", reason: `No pin with id "${props.pin_id}".` };
    if (!pin.camera) {
      return {
        status: "cancelled",
        reason: `Pin "${pin.name}" has no saved camera (not a Shot pin).`,
      };
    }
    useCameraStore.getState().requestFraming(pin.camera);
    useAnnotationStore.getState().selectPin(pin.id);
    return {
      status: "finished",
      value: {
        pinId: pin.id,
        name: pin.name,
        focalMM: Math.round(fovToFocalLength(pin.camera.fov)),
      },
    };
  },
});

/**
 * `camera.get_state` — read the current live camera. Lets the AI
 * ground itself ("what does the camera currently see?") before
 * deciding to move it.
 */
export const GetCameraStateOp = defineOperator({
  id: "camera.get_state",
  label: "Get Camera State",
  description:
    "Read-only: returns the live camera's position, target, vertical FOV, derived focal length (mm), aperture, and DoF on/off.",
  flags: { readonly: true },
  props: {},
  exec() {
    const cam = useCameraStore.getState();
    if (!cam.current) {
      return { status: "cancelled", reason: "Camera not yet initialised." };
    }
    return {
      status: "finished",
      value: {
        position: [...cam.current.position],
        target: [...cam.current.target],
        fov_deg: cam.current.fov,
        focal_mm: Math.round(fovToFocalLength(cam.current.fov)),
        aperture_f: cam.apertureF,
        dof_enabled: cam.dofEnabled,
      },
    };
  },
});
