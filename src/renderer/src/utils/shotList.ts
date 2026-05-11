import { AnnotationPin } from "@/state/annotationStore";
import { fovToFocalLength } from "@/state/cameraStore";

/**
 * Generate a markdown shot list from all pins. Shot-type pins with full
 * camera data appear first; other pin types are listed as additional notes
 * at the end.
 */
export function buildShotListMarkdown(
  projectName: string,
  pins: AnnotationPin[],
  centerLatLng: { lat: number; lng: number }
): string {
  const shotPins = pins.filter((p) => p.type === "shot" && p.camera);
  const otherPins = pins.filter((p) => p.type !== "shot" || !p.camera);

  const dateStr = new Date().toLocaleString();

  const lines: string[] = [];
  lines.push(`# Shot List — ${projectName}`);
  lines.push("");
  lines.push(`Generated: ${dateStr}`);
  lines.push(`Location: ${centerLatLng.lat.toFixed(5)}, ${centerLatLng.lng.toFixed(5)}`);
  lines.push("");
  lines.push(`**${shotPins.length} shot${shotPins.length === 1 ? "" : "s"}** — ${otherPins.length} additional pin${otherPins.length === 1 ? "" : "s"}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  shotPins.forEach((pin, idx) => {
    const cam = pin.camera!;
    const focalMm = Math.round(fovToFocalLength(cam.fov));

    lines.push(`## ${idx + 1}. ${pin.name || `Shot ${idx + 1}`}`);
    lines.push("");
    if (pin.description) {
      lines.push(`> ${pin.description}`);
      lines.push("");
    }
    lines.push(`| Field | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| **Focal length** | ${focalMm}mm (${cam.fov.toFixed(1)}° FOV) |`);
    lines.push(
      `| **Camera position** | (${cam.position.map((n) => n.toFixed(2)).join(", ")}) |`
    );
    lines.push(
      `| **Camera target** | (${cam.target.map((n) => n.toFixed(2)).join(", ")}) |`
    );
    lines.push(
      `| **Camera height** | ${cam.position[1].toFixed(2)}m above ground |`
    );
    if (pin.tags.length > 0) {
      lines.push(`| **Tags** | ${pin.tags.map((t) => `\`${t}\``).join(", ")} |`);
    }
    lines.push("");
  });

  if (otherPins.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Additional Pins");
    lines.push("");

    otherPins.forEach((pin) => {
      lines.push(
        `- **${pin.name || pin.type}** _(${pin.type})_${pin.description ? ` — ${pin.description}` : ""}`
      );
    });
  }

  return lines.join("\n");
}
