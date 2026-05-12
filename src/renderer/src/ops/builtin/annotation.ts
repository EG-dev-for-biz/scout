import { defineOperator } from "../define";
import type { EnumProp } from "../prop";
import { useAnnotationStore, type PinType } from "@/state/annotationStore";

/**
 * Annotation pin ops — let the AI place location-scout markers.
 *
 * The renderer also has a "pending pin" flow where the next scene
 * click drops a pin; the AI doesn't have access to that interaction
 * (it has no click model), so it places pins at explicit world
 * coordinates. Use `camera.get_state` to get the current target as
 * a sensible default position.
 */
export const AddPinOp = defineOperator({
  id: "annotation.add_pin",
  label: "Add Pin",
  description:
    "Drop an annotation pin at a world-space point. Types: 'shot' (camera bookmark), 'location' (place mark), 'note' (yellow), 'hazard' (red). Returns the new pin id.",
  flags: { undo: true },
  props: {
    type: {
      kind: "enum",
      default: "note",
      values: [
        { id: "shot", description: "Cinematic shot bookmark." },
        { id: "location", description: "A named place on the ground." },
        { id: "note", description: "A general note." },
        { id: "hazard", description: "A hazard / no-go marker." },
      ],
      ui: { tooltip: "Pin type." },
    } as EnumProp<PinType>,
    name: {
      kind: "string",
      default: "Pin",
      ui: { tooltip: "Human-readable name for the pin." },
    },
    position: {
      kind: "vec3",
      subtype: "translation",
      default: [0, 0, 0],
      ui: { unit: "m", tooltip: "World-space [x, y, z] in scene metres." },
    },
    description: {
      kind: "string",
      default: "",
      ui: { tooltip: "Optional description text." },
    },
    tags: {
      kind: "string",
      default: "",
      ui: { tooltip: "Comma-separated tag list (e.g. 'sunset,west')." },
    },
  },
  exec(_ctx, props) {
    const tags = props.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const id = useAnnotationStore.getState().addPin({
      type: props.type,
      name: props.name,
      position: { x: props.position[0], y: props.position[1], z: props.position[2] },
      description: props.description,
      tags,
    });
    return { status: "finished", value: { pinId: id, name: props.name, type: props.type } };
  },
});

export const RemovePinOp = defineOperator({
  id: "annotation.remove_pin",
  label: "Remove Pin",
  description: "Delete an annotation pin by id.",
  flags: { undo: true },
  props: {
    pin_id: {
      kind: "string",
      default: "",
      ui: { tooltip: "The id of the pin to delete." },
    },
  },
  exec(_ctx, props) {
    if (!props.pin_id) return { status: "error", message: "pin_id is required." };
    const before = useAnnotationStore.getState().pins.length;
    useAnnotationStore.getState().removePin(props.pin_id);
    const after = useAnnotationStore.getState().pins.length;
    return after < before
      ? { status: "finished" }
      : { status: "cancelled", reason: `No pin with id "${props.pin_id}".` };
  },
});

export const ListPinsOp = defineOperator({
  id: "scene.list_pins",
  label: "List Pins",
  description:
    "Read-only: list every annotation pin in the scene. Returns id, name, type, world position, tags, and (for Shot pins) the captured camera focal length.",
  flags: { readonly: true },
  props: {
    type_filter: {
      kind: "enum",
      default: "any",
      values: [
        { id: "any", description: "All pins." },
        { id: "shot", description: "Only Shot pins." },
        { id: "location", description: "Only Location pins." },
        { id: "note", description: "Only Note pins." },
        { id: "hazard", description: "Only Hazard pins." },
      ],
      ui: { tooltip: "Restrict results to one pin type, or 'any' to skip the filter." },
    } as EnumProp<"any" | PinType>,
  },
  exec(_ctx, props) {
    const pins = useAnnotationStore.getState().pins.filter((p) =>
      props.type_filter === "any" ? true : p.type === props.type_filter,
    );
    return {
      status: "finished",
      value: {
        count: pins.length,
        items: pins.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          position: [p.position.x, p.position.y, p.position.z],
          tags: p.tags,
          ...(p.camera ? { has_camera: true, fov_deg: p.camera.fov } : { has_camera: false }),
        })),
      },
    };
  },
});

export const ClearPinsOp = defineOperator({
  id: "annotation.clear_pins",
  label: "Clear Pins",
  description: "Delete every annotation pin from the scene. Undoable.",
  flags: { undo: true },
  props: {},
  exec() {
    const count = useAnnotationStore.getState().pins.length;
    useAnnotationStore.getState().clearPins();
    return { status: "finished", value: { removed: count } };
  },
});
