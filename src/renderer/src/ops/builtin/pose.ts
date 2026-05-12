import { defineOperator } from "../define";
import type { EnumProp } from "../prop";
import { ALL_POSES, usePoseStore } from "@/state/poseStore";
import { useCarStore } from "@/state/carStore";

/**
 * `pose.set_active` — change the mannequin's stationary pose. Only the
 * poses that actually loaded from `/anim/*.fbx` are exposed to the AI
 * — `availableIds` is populated by `Car.tsx` once the FBX probes
 * resolve. Falls back to the full preset list before any probe has
 * landed.
 */
export const SetActivePoseOp = defineOperator({
  id: "pose.set_active",
  label: "Set Pose",
  description:
    "Set the mannequin's current pose. Locomotion poses (idle, walk, run) are auto-driven in drive mode; this is for the stationary mannequin outside drive mode.",
  flags: { undo: true },
  props: {
    id: {
      kind: "enum",
      default: "idle",
      values: ALL_POSES.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
      })),
      ui: { tooltip: "Pose id." },
    } as EnumProp<string>,
  },
  exec(_ctx, props) {
    usePoseStore.getState().setActivePose(props.id);
    return { status: "finished", value: { applied: props.id } };
  },
});

export const SetDriveModeOp = defineOperator({
  id: "car.set_drive_mode",
  label: "Set Drive Mode",
  description:
    "Toggle drive mode (third-person mannequin / vehicle locomotion). Pair with `car.set_first_person` once drive mode is on.",
  flags: { undo: true },
  props: {
    enabled: { kind: "bool", default: true, ui: { tooltip: "Whether drive mode is on." } },
  },
  exec(_ctx, props) {
    const car = useCarStore.getState();
    car.setThirdMode(props.enabled);
    if (!props.enabled) car.setFirstPerson(false);
    return { status: "finished" };
  },
});

export const SetFirstPersonOp = defineOperator({
  id: "car.set_first_person",
  label: "Set First Person",
  description:
    "While drive mode is on, switch between first- and third-person camera. No-op if drive mode is off.",
  flags: { undo: true },
  props: {
    enabled: { kind: "bool", default: true, ui: { tooltip: "Whether first-person view is on." } },
  },
  exec(_ctx, props) {
    const car = useCarStore.getState();
    if (!car.thirdMode) {
      return { status: "cancelled", reason: "Drive mode is off." };
    }
    car.setFirstPerson(props.enabled);
    return { status: "finished" };
  },
});
