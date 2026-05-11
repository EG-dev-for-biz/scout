import React, { useEffect, useState, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useAreaStore } from "@/state/areaStore";
import { Sky, Environment, Line } from "@react-three/drei";
import * as THREE from "three";
import { useActionStore } from "@/state/exportStore";
import { GLTFExporter } from "three/examples/jsm/Addons.js";
import { useAnnotationStore, PinType } from "@/state/annotationStore";
import { useProjectStore } from "@/state/projectStore";
import { useStyleStore } from "@/state/styleStore";
import { useTimeStore } from "@/state/timeStore";
import { useRenderModeStore } from "@/state/renderModeStore";
import { buildShotListMarkdown } from "@/utils/shotList";
import { getSolarPosition, solarDirectionVector } from "@/utils/solarPosition";
import { AnnotationPin } from "@/components/AnnotationPin";
import { SatelliteGround } from "./SatelliteGround";
import { PostFX } from "./PostFX";
import { PhotorealTiles } from "./PhotorealTiles";
import { CameraController } from "./CameraController";
import { PaintedSky } from "./PaintedSky";
import { AtmosphericRig } from "./AtmosphericRig";
import { Precipitation } from "./Precipitation";
import { useProjectedBuildingMaterial } from "./ProjectedBuildingMaterial";
import { usePaintedSceneStore } from "@/state/paintedSceneStore";
import { useCarStore } from "@/state/carStore";
import { useCameraStore } from "@/state/cameraStore";
import { usePoseStore } from "@/state/poseStore";
import { useWeatherStore } from "@/state/weatherStore";
import Car from "./Car";
import instanceFleet from "@/api/axios";

const scale = 51000;

/**
 * Shared ground reference in world Y. All foreground geometry (satellite
 * texture plane, OSM building bases, roads, click-target plane, mannequin
 * feet) anchors to this Y so they stay coplanar. Adjusting this single
 * value re-grounds the entire OSM scene.
 *
 * Also exported so Car.tsx can place the mannequin on the same surface.
 */
export const GROUND_Y = -1.3;

// ---------------------------------------------------------------------------
// Building mesh
// ---------------------------------------------------------------------------

function Building({
  buildingId,
  shape,
  extrudeSettings,
  tags,
  onSceneClick,
  wireframeOnly = false,
  groundWidth = 0,
  groundHeight = 0,
}: {
  buildingId: string;
  shape: THREE.Shape;
  extrudeSettings: any;
  tags: any;
  onSceneClick?: (point: THREE.Vector3) => void;
  /** Hybrid mode: render as transparent click-target only */
  wireframeOnly?: boolean;
  /** Scene plane dimensions in meters — passed to shader for rooftop ground sampling */
  groundWidth?: number;
  groundHeight?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);

  const mat = useStyleStore((s) => s.active.materials);
  // Wetness from weather store. Pulls roughness down on the plain standard
  // material path (toon shading stays matte — wet toon doesn't read right).
  const wetness = useWeatherStore((s) => s.wetness);
  // When the ground has been AI-painted, swap to the derived palette so
  // buildings harmonize with the painted aerial.
  const derivedPalette = usePaintedSceneStore((s) => s.derivedBuildingPalette);
  // Per-building view (full view-proj matrix) if this building has been baked
  const perBuildingView = usePaintedSceneStore(
    (s) => s.perBuildingViews[buildingId]
  );
  // Painted ground texture (used by shader for rooftop sampling)
  const paintedGroundTexUrl = usePaintedSceneStore((s) => s.groundTexture);

  const baseColor = derivedPalette?.base ?? mat.buildingBase;
  const hoverColor = derivedPalette?.hover ?? mat.buildingHover;
  const emissiveColor = derivedPalette?.emissive ?? mat.buildingEmissive;
  const emissiveIntensity =
    derivedPalette?.emissiveIntensity ?? mat.buildingEmissiveIntensity;

  const color = hovered || clicked ? hoverColor : baseColor;

  // The projective material handles THREE sources:
  //   - Per-building override view (single capture, projected from this
  //     building's own captured camera angle — sharp facade, no rooftop bleed)
  //   - Shared multi-view (4 cardinal captures from auto-paint) when no
  //     per-building view exists for this specific building
  //   - Painted ground texture (for ROOFTOP sampling on top-facing fragments)
  const projectedMaterial = useProjectedBuildingMaterial({
    baseColor: color,
    emissive: emissiveColor,
    emissiveIntensity,
    perBuildingView: perBuildingView ?? null,
    groundTextureUrl: paintedGroundTexUrl,
    groundWidth,
    groundHeight,
  });

  return (
    <mesh
      onPointerOver={(e) => { setHovered(true); e.stopPropagation(); }}
      onPointerOut={(e) => { setHovered(false); e.stopPropagation(); }}
      onClick={(e) => {
        e.stopPropagation();
        if (onSceneClick) {
          onSceneClick(e.point.clone());
        } else {
          setClicked(!clicked);
        }
      }}
      rotation={[-Math.PI / 2, 0, 0]}
      // Building bases sit on the shared ground reference so they stay
      // coplanar with the satellite texture, roads, and the mannequin.
      position={[0, GROUND_Y, 0]}
      // No-op when the Canvas shadows pass is off (legacy mode). When the
      // AtmosphericRig is active, its SunLight casts hard shadows from the
      // building extrusions onto the satellite ground and other buildings.
      castShadow
      receiveShadow
    >
      <extrudeGeometry args={[shape, extrudeSettings]} />
      {wireframeOnly ? (
        <meshBasicMaterial
          color={hovered || clicked ? hoverColor : "#3b82f6"}
          wireframe
          transparent
          opacity={hovered || clicked ? 0.6 : 0.0}
        />
      ) : projectedMaterial ? (
        // Projective shader. If this building has a per-building bake,
        // the shader uses ONLY that one captured view (sharp facade, no
        // rooftop bleed). Otherwise falls back to shared cardinal captures.
        <primitive object={projectedMaterial} attach="material" />
      ) : mat.toonShading ? (
        <meshToonMaterial color={color} />
      ) : (
        <meshStandardMaterial
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          // Roughness drops with wetness so building facades pick up
          // specular highlights in a storm or "after rain" mood.
          roughness={Math.max(0.15, 0.85 - wetness * 0.55)}
          metalness={wetness * 0.15}
        />
      )}

      {/* BuildingTooltip floating-info-card display has been disabled.
          Buildings still respond to hover/click for highlight + pin placement,
          but the OSM metadata cards no longer pop up over the scene. */}
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

function Roads({ area }: { area: any }) {
  const [roads, setRoads] = useState<any[]>([]);
  if (!area || area.length < 2) return null;
  const refLat = (area[1].lat + area[0].lat) / 2;
  const refLng = (area[1].lng + area[0].lng) / 2;

  function project(lat: number, lng: number) {
    const x = (lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180);
    const y = (lat - refLat) * scale;
    return new THREE.Vector2(x, y);
  }

  useEffect(() => {
    const south = area[1].lat;
    const west = area[1].lng;
    const north = area[0].lat;
    const east = area[0].lng;
    const query = `[out:json][timeout:25];(way["highway"](${south},${west},${north},${east}););out body geom;`;
    fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: query,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
      .then((r) => r.json())
      .then((data) => setRoads(data.elements))
      .catch(console.error);
  }, [area]);

  return (
    <>
      {roads.map((road, i) => {
        if (!road.geometry || road.geometry.length < 2) return null;
        const pts = road.geometry.map((pt: any) => {
          const v = project(pt.lat, pt.lon);
          // Roads sit 10 cm above the shared ground plane so they read as
          // an overlay on the satellite imagery, not z-fight with it.
          return new THREE.Vector3(v.x, GROUND_Y + 0.1, -v.y);
        });
        return <Line key={i} points={pts} color="#22c55e" lineWidth={1} />;
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Ground plane (click target for placing pins in open areas)
// ---------------------------------------------------------------------------

function GroundPlane({ onSceneClick }: { onSceneClick?: (point: THREE.Vector3) => void }) {
  if (!onSceneClick) return null;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      // Click target sits 1 cm below the satellite texture so pin
      // placement raycasts hit it after passing through visible geometry.
      position={[0, GROUND_Y - 0.01, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSceneClick(e.point.clone());
      }}
    >
      <planeGeometry args={[10000, 10000]} />
      <meshStandardMaterial transparent opacity={0} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Export controller (GLB + annotations JSON)
// ---------------------------------------------------------------------------

export function Export() {
  const { scene } = useThree();
  const action = useActionStore((s) => s.action);
  const exportType = useActionStore((s) => s.exportType);
  const fleetSpaceId = useActionStore((s) => s.fleetSpaceId);
  const setAction = useActionStore((s) => s.setAction);
  const pins = useAnnotationStore((s) => s.pins);
  const projectName = useProjectStore((s) => s.projectName);
  const center = useAreaStore((s) => s.center);

  useEffect(() => {
    if (!action) return;
    setAction(false);

    if (exportType === "annotations") {
      exportAnnotationsJson();
    } else if (exportType === "shotlist") {
      exportShotList();
    } else {
      exportGLB();
    }
  }, [action]);

  const exportAnnotationsJson = async () => {
    const content = JSON.stringify({ annotations: pins }, null, 2);
    if (window.api) {
      await window.api.dialog.exportFile("annotations.json", content);
    } else {
      const blob = new Blob([content], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "annotations.json";
      link.click();
    }
  };

  const exportShotList = async () => {
    const refLat = (center[0].lat + center[1].lat) / 2;
    const refLng = (center[0].lng + center[1].lng) / 2;
    const md = buildShotListMarkdown(projectName, pins, { lat: refLat, lng: refLng });
    const filename = `${projectName.replace(/[^a-z0-9]+/gi, "_") || "shot_list"}.md`;
    if (window.api) {
      await window.api.dialog.exportFile(filename, md);
    } else {
      const blob = new Blob([md], { type: "text/markdown" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
    }
  };

  const uploadFleet = async (blob: Blob) => {
    const formData = new FormData();
    formData.append("object", blob, "scout3d.glb");
    formData.append("title", "Scout3D Export");
    formData.append("description", "");
    formData.append("spaceId", fleetSpaceId);
    await instanceFleet.post("space/file/mesh", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  };

  const exportGLB = () => {
    const sceneClone = scene.clone(true);

    // Embed annotation metadata in the GLB root
    sceneClone.userData = {
      ...sceneClone.userData,
      scout3d_annotations: pins,
    };

    // Strip Html overlays and skip-export objects
    sceneClone.traverse((child) => {
      if (child.userData?.skipExport === true) child.parent?.remove(child);
      if ((child as any).isHtml === true) child.parent?.remove(child);
    });

    const exporter = new GLTFExporter();
    exporter.parse(
      sceneClone,
      async (result) => {
        if (!(result instanceof ArrayBuffer)) {
          console.error("GLB export: unexpected result", result);
          return;
        }
        const blob = new Blob([result], { type: "model/gltf-binary" });

        if (exportType === "fleet") {
          await uploadFleet(blob);
          return;
        }

        // GLB download via Electron dialog or browser fallback
        if (window.api) {
          const arrayBuffer = await blob.arrayBuffer();
          await window.api.dialog.exportFile("scene.glb", arrayBuffer);
        } else {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = "scene.glb";
          link.click();
        }
      },
      (err) => console.error("GLB export error:", err),
      { binary: true, embedImages: true }
    );
  };

  return null;
}

// ---------------------------------------------------------------------------
// Main Space scene
// ---------------------------------------------------------------------------

interface SpaceProps {
  pendingPinType?: PinType | null;
  onPinPlaced?: () => void;
}

export function Space({ pendingPinType, onPinPlaced }: SpaceProps) {
  const areas = useAreaStore((s) => s.areas);
  const center = useAreaStore((s) => s.center);
  const pins = useAnnotationStore((s) => s.pins);
  const addPin = useAnnotationStore((s) => s.addPin);
  const markDirty = useProjectStore((s) => s.markDirty);
  const style = useStyleStore((s) => s.active);
  const date = useTimeStore((s) => s.date);
  const solarLightingEnabled = useTimeStore((s) => s.solarLightingEnabled);
  const atmosphereEnabled = useTimeStore((s) => s.atmosphereEnabled);
  const sunStrength = useWeatherStore((s) => s.sunStrength);
  const renderMode = useRenderModeStore((s) => s.mode);
  const thirdMode = useCarStore((s) => s.thirdMode);
  const paintedSky = usePaintedSceneStore((s) => s.skyTexture);
  const [realCenter, setRealCenter] = useState<any>();

  const showOsmBuildings = renderMode === "osm" || renderMode === "hybrid";
  const showPhotoreal = renderMode === "photoreal" || renderMode === "hybrid";
  const showSatelliteGround = renderMode === "osm";

  // Compute sun direction from current scene lat/lng + time
  const refLatForSun = (center[0].lat + center[1].lat) / 2;
  const refLngForSun = (center[0].lng + center[1].lng) / 2;
  const sun = getSolarPosition(date, refLatForSun, refLngForSun);
  const sunDir = solarDirectionVector(sun);

  // Choose which sun position drives the light:
  //   - Solar lighting on  → real sun for lat/lng/datetime
  //   - Solar lighting off → style preset's authored sun position
  const effectiveSunPos: [number, number, number] = solarLightingEnabled
    ? sunDir
    : style.sky.sunPosition;

  // Below-horizon attenuation for solar lighting: dim the sun, lift ambient
  const isNight = solarLightingEnabled && sun.altitude < -0.05;
  const baseSunIntensity = solarLightingEnabled
    ? Math.max(0.05, Math.sin(Math.max(0, sun.altitude))) * Math.PI
    : Math.PI;
  const baseAmbientIntensity = isNight
    ? Math.PI * 0.15
    : style.sky.ambientIntensity;
  // Sun-strength multiplier from weather store. Full effect on the
  // directional sun; partial pass-through to ambient (0.5..1.5 of base)
  // so dialing up the sun also brightens shadow sides without flatlining
  // the contrast.
  const sunIntensity = baseSunIntensity * sunStrength;
  const ambientIntensity =
    baseAmbientIntensity * (0.5 + sunStrength * 0.5);

  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;

  // Scene plane dimensions (matches SatelliteGround.tsx). Passed to building
  // shader for rooftop sampling — each rooftop fragment converts its world XZ
  // into a UV on the painted ground texture using these dimensions.
  const lngSpan = Math.abs(center[0].lng - center[1].lng);
  const latSpan = Math.abs(center[0].lat - center[1].lat);
  const groundWidth = lngSpan * scale * Math.cos((refLat * Math.PI) / 180);
  const groundHeight = latSpan * scale;

  function project(lat: number, lng: number) {
    const x = (lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180);
    const y = (lat - refLat) * scale;
    return new THREE.Vector2(x, y);
  }

  const buildingsData = areas
    .filter((bld: any) => bld.geometry && bld.geometry.length >= 3)
    .map((bld: any, idx: number) => {
      const shapePoints = bld.geometry.map((pt: any) => project(pt.lat, pt.lng));
      if (!shapePoints[0].equals(shapePoints[shapePoints.length - 1]))
        shapePoints.push(shapePoints[0]);
      const shape = new THREE.Shape(shapePoints);
      let h = parseFloat(bld.tags.height || "");
      const levels = parseFloat(bld.tags["building:levels"] || "");
      if (isNaN(h)) h = 10;
      if (!isNaN(levels)) h = levels * 2.2;
      return {
        // Building id MUST match the ones used in paintPerBuilding.ts so the
        // shader can look up the per-building texture by id.
        id: String(bld.id ?? `idx_${idx}`),
        shape,
        extrudeSettings: { steps: 1, depth: h, bevelEnabled: false },
        tags: bld.tags,
      };
    });

  useEffect(() => {
    setRealCenter(center);
  }, [areas]);

  const focusPickMode = useCameraStore((s) => s.focusPickMode);
  const setFocusTarget = useCameraStore((s) => s.setFocusTarget);
  const setFocusPickMode = useCameraStore((s) => s.setFocusPickMode);
  const lookAtPickMode = usePoseStore((s) => s.lookAtPickMode);
  const setLookAtTarget = usePoseStore((s) => s.setLookAtTarget);
  const setLookAtPickMode = usePoseStore((s) => s.setLookAtPickMode);

  const handleSceneClick = useCallback(
    (point: THREE.Vector3) => {
      // Mannequin look-at pick wins over focus + pin placement so the
      // user's most recent UI gesture (clicking "Look at..." in the popup)
      // gets the next click.
      if (lookAtPickMode) {
        setLookAtTarget([point.x, point.y, point.z]);
        setLookAtPickMode(false);
        return;
      }
      // Focus pick wins over pin placement when both modes happen to be
      // active. Sets the DoF target and auto-clears the pick state so the
      // next click goes back to normal scene interaction.
      if (focusPickMode) {
        setFocusTarget([point.x, point.y, point.z]);
        setFocusPickMode(false);
        return;
      }
      if (!pendingPinType) return;
      addPin({
        name: "",
        type: pendingPinType,
        position: { x: point.x, y: point.y, z: point.z },
        description: "",
        tags: [],
      });
      markDirty();
      onPinPlaced?.();
    },
    [
      lookAtPickMode,
      focusPickMode,
      pendingPinType,
      addPin,
      markDirty,
      onPinPlaced,
      setFocusTarget,
      setFocusPickMode,
      setLookAtTarget,
      setLookAtPickMode,
    ]
  );

  // Any pick mode wants pointer events on geometry so the click handler fires.
  const wantsSceneClicks = pendingPinType || focusPickMode || lookAtPickMode;

  // Atmospheric rig + painted skybox are mutually exclusive:
  //   - Painted skybox is a stylized AI-generated dome; physical sky would
  //     fight it visually.
  //   - When the user has painted a sky, fall back to the legacy path so
  //     PaintedSky renders as before.
  const useAtmosphere = atmosphereEnabled && !paintedSky;

  // Shared scene content — identical between atmospheric and legacy paths.
  // Lights / sky / fog / post-process differ; geometry does not.
  const sceneContent = (
    <>
      {/* World floor — only in OSM mode (photoreal includes terrain). Sits
          ~70 cm below the satellite plane as a dark backstop when the
          camera tilts under the horizon. */}
      {showSatelliteGround && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, GROUND_Y - 0.7, 0]}
          receiveShadow
        >
          <planeGeometry args={[50000, 50000]} />
          <meshStandardMaterial color="#0a0a0c" roughness={1} metalness={0} />
        </mesh>
      )}

      {/* Satellite ground — shown only in OSM mode (photoreal includes ground).
          Anchored to GROUND_Y so building bases, roads, and the mannequin
          all share the same vertical reference. */}
      {showSatelliteGround && realCenter && (
        <SatelliteGround center={realCenter} yOffset={GROUND_Y} />
      )}

      {/* Photoreal Google 3D Tiles */}
      {showPhotoreal && realCenter && <PhotorealTiles center={realCenter} />}

      {/* OSM extruded buildings */}
      {showOsmBuildings &&
        buildingsData.map((item) => (
          <Building
            key={item.id}
            buildingId={item.id}
            shape={item.shape}
            extrudeSettings={item.extrudeSettings}
            tags={item.tags}
            onSceneClick={wantsSceneClicks ? handleSceneClick : undefined}
            wireframeOnly={renderMode === "hybrid"}
            groundWidth={groundWidth}
            groundHeight={groundHeight}
          />
        ))}

      {/* Roads — only in OSM mode (photoreal already shows roads via imagery) */}
      {showOsmBuildings && renderMode !== "hybrid" && <Roads area={realCenter} />}

      {/* Ground click plane (for placing pins in open areas) */}
      <GroundPlane onSceneClick={wantsSceneClicks ? handleSceneClick : undefined} />

      {/* Annotation Pins */}
      {pins.map((pin) => (
        <AnnotationPin key={pin.id} pin={pin} />
      ))}

      <Car />

      {/* Weather particles — rain, drizzle, snow. Single-draw-call points
          system, follows the camera so streaks always surround the viewer.
          Lives in shared sceneContent so it renders identically in both
          atmospheric and legacy paths. */}
      <Precipitation />
    </>
  );

  return (
    <Canvas
      // `shadows` is required for SunLight.castShadow in atmospheric mode.
      // Cheap no-op for the legacy path (no light has castShadow there).
      shadows
      // `far: 1e5` is needed for the atmosphere/cloud shell. Safe in legacy
      // mode (near stays at 0.1, so Z-precision is unchanged).
      camera={{ fov: 60, near: 0.1, far: 1e5 }}
      gl={{ preserveDrawingBuffer: true }}
      style={{ cursor: wantsSceneClicks ? "crosshair" : "default" }}
    >
      {useAtmosphere ? (
        <AtmosphericRig>{sceneContent}</AtmosphericRig>
      ) : (
        <>
          {/* Baseline lights — always present so building sides aren't pitch
              black. Sun direction either follows real solar position (when
              enabled) or the style preset's authored sun. */}
          <ambientLight
            color={style.sky.ambientColor}
            intensity={ambientIntensity}
          />
          <directionalLight
            position={effectiveSunPos}
            color={style.sky.sunColor}
            intensity={sunIntensity}
            castShadow={false}
          />
          <pointLight
            position={[100, 100, 100]}
            decay={0}
            intensity={Math.PI * 0.4}
          />
          <pointLight
            position={[-100, 80, -100]}
            decay={0}
            intensity={Math.PI * 0.3}
          />

          {/* Style-driven fog */}
          {style.sky.fogDensity > 0 && (
            <fogExp2
              attach="fog"
              args={[style.sky.fogColor, style.sky.fogDensity]}
            />
          )}

          {sceneContent}

          {/* Painted skybox takes precedence over procedural sky/env when set. */}
          {paintedSky ? (
            <PaintedSky />
          ) : (
            <>
              <Sky
                distance={450000}
                sunPosition={effectiveSunPos}
                inclination={style.sky.skyInclination}
                azimuth={style.sky.skyAzimuth}
              />
              {style.sky.envPreset && <Environment preset={style.sky.envPreset} />}
            </>
          )}

          {/* Post-process pipeline */}
          <PostFX />
        </>
      )}

      {/* Camera + export hooks run in both modes. */}
      <CameraController active={!thirdMode} />
      <Export />
    </Canvas>
  );
}
