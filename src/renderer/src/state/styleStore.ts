import { create } from "zustand";

// ---------------------------------------------------------------------------
// StyleProfile schema
// ---------------------------------------------------------------------------

export interface StyleProfile {
  id: string;
  name: string;
  description: string;

  /**
   * Prompt sent to Gemini's image-edit model when the user runs an AI
   * Restyle pass. Phrased as a transformation instruction operating on the
   * captured viewport screenshot.
   */
  restylePrompt: string;

  /**
   * Prompt for "Paint Scene" — operates on the *aerial* satellite texture
   * (top-down map view). Must preserve the geographical layout (streets,
   * building footprints, water boundaries) while restyling appearance.
   */
  groundTexturePrompt: string;

  /**
   * Prompt for the painted skybox. Operates on a 2:1 gradient placeholder
   * and asks Gemini to paint a horizon panorama in the active style.
   */
  skyPrompt: string;

  /**
   * Prompt for "Paint Buildings". Operates on a captured viewport screenshot
   * of the current scene and asks Gemini to paint the BUILDINGS in the active
   * style. The result is then projected as a screen-space texture onto the
   * 3D building meshes from the captured camera angle.
   */
  buildingsPaintPrompt: string;

  /** Material override applied to buildings/ground. */
  materials: {
    toonShading: boolean;
    /** Multiplier on the satellite ground texture. */
    groundTint: string;
    /** Buildings color when satellite mesh override is off. */
    buildingBase: string;
    buildingHover: string;
    /** Optional emissive on building tops to suggest lit windows. */
    buildingEmissive: string;
    buildingEmissiveIntensity: number;
  };

  /** Sky / lighting parameters. */
  sky: {
    sunPosition: [number, number, number];
    sunColor: string;
    ambientColor: string;
    ambientIntensity: number;
    skyInclination: number;
    skyAzimuth: number;
    fogColor: string;
    fogDensity: number; // 0 = no fog
    /** Drei <Environment> preset. null disables. */
    envPreset:
      | "sunset"
      | "dawn"
      | "night"
      | "warehouse"
      | "forest"
      | "apartment"
      | "studio"
      | "city"
      | "park"
      | "lobby"
      | null;
  };

  /** Post-process effects pipeline. */
  postFX: {
    bloom: { enabled: boolean; intensity: number; threshold: number };
    chromaticAberration: { enabled: boolean; offset: number };
    vignette: { enabled: boolean; darkness: number; offset: number };
    noise: { enabled: boolean; opacity: number };
    /** Toon-style outline pass on edges. */
    outline: { enabled: boolean };
    /** Color grading via hue/sat/brightness/contrast. */
    grade: {
      enabled: boolean;
      hue: number; // -π … π
      saturation: number; // -1 … 1
      brightness: number; // -1 … 1
      contrast: number; // -1 … 1
    };
    /** Posterize / palette quantization. */
    posterize: { enabled: boolean; levels: number };
    /** Pixelate / dithered look (Spider-Verse halftone). */
    pixelation: { enabled: boolean; granularity: number };
  };
}

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

const REALISTIC: StyleProfile = {
  id: "realistic",
  name: "Realistic",
  description: "Default — accurate satellite imagery, neutral lighting.",
  restylePrompt:
    "Subtly enhance this 3D city scene to look like a polished cinematic still: improve realism, add atmospheric perspective and natural haze, refine textures and lighting, but keep the architecture, geometry, composition, and camera angle identical.",
  groundTexturePrompt:
    "Enhance this aerial photograph for cinematic clarity. Sharpen detail, deepen shadows, refine color, but keep it photographic and realistic. Preserve all street layouts, building footprints, parks, water, and roads exactly. Remove any watermarks, logos, copyright text, or labels from the image — fill the entire frame with clean aerial imagery.",
  skyPrompt:
    "Replace this gradient with a photorealistic 360-degree equirectangular sky panorama. Soft natural cumulus clouds, gentle daylight blue gradient, subtle atmospheric haze near the horizon, golden warm tone where sky meets earth. The image should fill the entire 2:1 frame edge-to-edge with sky — no ground, no buildings, just sky and clouds.",
  buildingsPaintPrompt:
    "Enhance the buildings in this 3D city scene with realistic facade detail: add subtle window patterns, roof texture variation, soft architectural shadows, and natural concrete/glass materials. Keep the camera angle, building positions, and overall composition identical. Do not change the ground, sky, or any other elements visibly — focus on making the building surfaces feel more architecturally real.",
  materials: {
    toonShading: false,
    groundTint: "#ffffff",
    buildingBase: "#c0c4c8",
    buildingHover: "#3b82f6",
    buildingEmissive: "#000000",
    buildingEmissiveIntensity: 0,
  },
  sky: {
    sunPosition: [0.6, 0.8, 0.4],
    sunColor: "#fff8e7",
    ambientColor: "#dde4ec",
    ambientIntensity: Math.PI * 0.9,
    skyInclination: 0.15,
    skyAzimuth: 0.25,
    fogColor: "#bcd0e0",
    fogDensity: 0,
    envPreset: "city",
  },
  postFX: {
    bloom: { enabled: false, intensity: 0, threshold: 0.9 },
    chromaticAberration: { enabled: false, offset: 0 },
    vignette: { enabled: false, darkness: 0, offset: 0 },
    noise: { enabled: false, opacity: 0 },
    outline: { enabled: false },
    grade: { enabled: false, hue: 0, saturation: 0, brightness: 0, contrast: 0 },
    posterize: { enabled: false, levels: 8 },
    pixelation: { enabled: false, granularity: 1 },
  },
};

const PIXAR_DAYTIME: StyleProfile = {
  id: "pixar",
  name: "Pixar Daytime",
  description: "Warm, soft, slightly stylized — golden hour with toon shading.",
  restylePrompt:
    "Reimagine this 3D city scene as a frame from a Pixar animated film: warm golden-hour lighting, soft saturated colors, gentle subsurface scattering, slightly stylized but architecturally faithful, family-friendly polish, dust motes drifting in shafts of sunlight, subtle volumetric atmosphere. Keep the architecture, geometry, composition, and camera angle identical.",
  groundTexturePrompt:
    "Completely transform this aerial photograph into a Pixar-quality hand-painted aerial illustration. NOT a photograph — a painted illustration as if from a Pixar establishing shot: warm golden-hour palette of amber, cream, and soft orange; smooth Pixar polish; saturated cheerful colors; stylized soft shadows on rooftops; everything looks rendered, not photographed. Preserve all street layouts, building footprints, parks, water, and roads exactly. Remove any watermarks, logos, copyright text, or labels — fill the entire frame with the painted aerial.",
  skyPrompt:
    "Replace this gradient with a Pixar-animated-film sky panorama: warm golden-hour cumulus clouds, soft saturated colors, dust motes drifting in shafts of sunlight, family-friendly polish, slightly stylized hand-painted clouds. 2:1 equirectangular ratio, fill the entire frame with sky — no ground, no buildings.",
  buildingsPaintPrompt:
    "Repaint ONLY the buildings in this 3D city scene as a frame from a Pixar animated film: warm golden-hour facade lighting, soft saturated colors, slightly stylized architecture but recognizable, dust motes drifting near windows, family-friendly polish. Add hand-painted Pixar texture detail to building walls, windows, rooftops. Keep the camera angle, building positions, ground, and sky unchanged — focus only on the building surfaces.",
  materials: {
    toonShading: true,
    groundTint: "#ffe5b4",
    buildingBase: "#d6b88a",
    buildingHover: "#ff7e3b",
    buildingEmissive: "#5a2a00",
    buildingEmissiveIntensity: 0.05,
  },
  sky: {
    sunPosition: [0.6, 0.7, 0.4],
    sunColor: "#ffd29e",
    ambientColor: "#ffeacc",
    ambientIntensity: Math.PI * 0.7,
    skyInclination: 0.45,
    skyAzimuth: 0.18,
    fogColor: "#ffd9a5",
    fogDensity: 0.001,
    envPreset: "sunset",
  },
  postFX: {
    bloom: { enabled: true, intensity: 0.6, threshold: 0.7 },
    chromaticAberration: { enabled: true, offset: 0.0008 },
    vignette: { enabled: true, darkness: 0.35, offset: 0.4 },
    noise: { enabled: false, opacity: 0 },
    outline: { enabled: false },
    grade: {
      enabled: true,
      hue: 0.05,
      saturation: 0.25,
      brightness: 0.05,
      contrast: 0.1,
    },
    posterize: { enabled: false, levels: 8 },
    pixelation: { enabled: false, granularity: 1 },
  },
};

const ARCANE_TWILIGHT: StyleProfile = {
  id: "arcane",
  name: "Arcane Twilight",
  description: "Painterly, dramatic teal/orange — high contrast, smoky, cinematic.",
  restylePrompt:
    "Reimagine this 3D city scene in the visual style of the Arcane (League of Legends) animated series: painterly oil-on-canvas brushwork, dramatic teal-and-orange industrial steampunk lighting, hand-painted facade textures with visible brush strokes, gritty atmosphere, dramatic chiaroscuro, smoky volumetric haze, deep shadows, glowing windows, Victorian industrial detailing. Keep the architecture, geometry, composition, and camera angle identical.",
  groundTexturePrompt:
    "Completely transform this aerial photograph into a hand-painted aerial in the EXACT visual style of the Arcane animated series (League of Legends). NOT a photograph — a fully painted oil-on-canvas illustration: visible thick painterly brushstrokes everywhere; dramatic teal-and-orange industrial palette; gritty Victorian-steampunk atmosphere; deep contrast; roads as brushed dark strokes; parks as loose green brushwork; rooftops as painterly blocks; smoky volumetric haze. Every pixel reads as oil painting, not photo. Preserve all street layouts, building footprints, parks, water, and roads exactly. Remove any watermarks, logos, copyright text, or labels — fill the entire frame with the painted aerial.",
  skyPrompt:
    "Replace this gradient with an Arcane-style equirectangular sky panorama: painterly oil-on-canvas brushwork, dramatic teal-and-orange industrial twilight, smoky volumetric clouds, glowing magic-orange highlights, dark gritty atmosphere with visible brush strokes. 2:1 equirectangular ratio, fill the entire frame with stylized sky — no ground, no buildings.",
  buildingsPaintPrompt:
    "Repaint ONLY the buildings in this 3D city scene in the EXACT visual style of the Arcane animated series (League of Legends): visible thick painterly oil-on-canvas brushstrokes on every facade; dramatic teal-and-orange industrial Victorian-steampunk lighting; gritty hand-painted facade textures with grime and patina; glowing warm-orange windows; smoky atmosphere around upper floors. Keep the camera angle, building positions, ground, and sky unchanged — focus only on transforming the building surfaces into hand-painted Arcane facades.",
  materials: {
    toonShading: true,
    groundTint: "#5a4a6a",
    buildingBase: "#3a3540",
    buildingHover: "#ff7a45",
    buildingEmissive: "#ff6a2a",
    buildingEmissiveIntensity: 0.15,
  },
  sky: {
    sunPosition: [-0.3, 0.15, 0.7],
    sunColor: "#ff7a45",
    ambientColor: "#1a3a4a",
    ambientIntensity: Math.PI * 0.4,
    skyInclination: 0.7,
    skyAzimuth: 0.65,
    fogColor: "#1a3a4a",
    fogDensity: 0.006,
    envPreset: "night",
  },
  postFX: {
    bloom: { enabled: true, intensity: 1.4, threshold: 0.5 },
    chromaticAberration: { enabled: true, offset: 0.0015 },
    vignette: { enabled: true, darkness: 0.7, offset: 0.3 },
    noise: { enabled: true, opacity: 0.06 },
    outline: { enabled: false },
    grade: {
      enabled: true,
      hue: -0.08,
      saturation: 0.4,
      brightness: -0.15,
      contrast: 0.4,
    },
    posterize: { enabled: false, levels: 6 },
    pixelation: { enabled: false, granularity: 1 },
  },
};

const WES_ANDERSON: StyleProfile = {
  id: "wes",
  name: "Wes Anderson",
  description: "Pastel, symmetrical, perfectly composed — flat warm palette.",
  restylePrompt:
    "Reimagine this 3D city scene as a frame from a Wes Anderson film: perfectly symmetrical composition, controlled pastel color palette (warm peach, pale yellow, dusty pink, mint green), flat even lighting, deadpan whimsical mood, retro typography on signage, slight tilt-shift miniaturization. Keep the architecture, geometry, composition, and camera angle identical.",
  groundTexturePrompt:
    "Completely transform this aerial photograph into a Wes Anderson-style flat graphic-design aerial illustration. NOT a photograph — a flat 2D graphic-design map with: pastel Wes Anderson palette of peach, mint, dusty pink, pale yellow only; perfectly even flat lighting (no shadows); retro storybook aesthetic; clean solid color blocks for buildings; minimal texture. Like a frame from The Grand Budapest Hotel rendered as an aerial map. Preserve all street layouts, building footprints, parks, water, and roads exactly. Remove any watermarks, logos, copyright text, or labels — fill the entire frame with the painted aerial.",
  skyPrompt:
    "Replace this gradient with a Wes Anderson pastel sky panorama: perfectly flat even pastel cumulus clouds, controlled palette of peach pink mint and pale yellow, deadpan whimsical retro storybook aesthetic, soft warm warm light. 2:1 equirectangular ratio, fill the entire frame with pastel sky — no ground, no buildings.",
  buildingsPaintPrompt:
    "Repaint ONLY the buildings in this 3D city scene as a Wes Anderson film: perfectly symmetrical pastel facades; controlled palette of peach, mint, dusty pink, pale yellow only; flat even illumination on walls; retro architectural details (Beaux-Arts, Art Deco motifs); decorative window patterns; deadpan storybook aesthetic. Keep the camera angle, building positions, ground, and sky unchanged — focus only on transforming the building surfaces into Wes Anderson pastel facades.",
  materials: {
    toonShading: true,
    groundTint: "#f4d6a8",
    buildingBase: "#f6c89f",
    buildingHover: "#d97757",
    buildingEmissive: "#000000",
    buildingEmissiveIntensity: 0,
  },
  sky: {
    sunPosition: [0.3, 0.9, 0.2],
    sunColor: "#fff1d6",
    ambientColor: "#ffe2c2",
    ambientIntensity: Math.PI * 0.9,
    skyInclination: 0.2,
    skyAzimuth: 0.3,
    fogColor: "#fdebd2",
    fogDensity: 0,
    envPreset: "apartment",
  },
  postFX: {
    bloom: { enabled: true, intensity: 0.3, threshold: 0.85 },
    chromaticAberration: { enabled: false, offset: 0 },
    vignette: { enabled: true, darkness: 0.25, offset: 0.6 },
    noise: { enabled: false, opacity: 0 },
    outline: { enabled: false },
    grade: {
      enabled: true,
      hue: 0.04,
      saturation: -0.1,
      brightness: 0.12,
      contrast: -0.05,
    },
    posterize: { enabled: false, levels: 12 },
    pixelation: { enabled: false, granularity: 1 },
  },
};

const SPIDER_VERSE: StyleProfile = {
  id: "spider",
  name: "Spider-Verse",
  description: "Comic halftone, heavy chromatic aberration, posterized colors.",
  restylePrompt:
    "Reimagine this 3D city scene in the visual style of Spider-Man: Into the Spider-Verse: comic-book halftone Ben-Day dots, heavy chromatic aberration with red/cyan offset, bold posterized color palette, thick black ink outlines around forms, kinetic motion lines, vibrant magenta and electric blue accents. Keep the architecture, geometry, composition, and camera angle identical.",
  groundTexturePrompt:
    "Completely transform this aerial photograph into a Spider-Verse comic-book aerial. NOT a photograph — a comic-book panel illustration with: visible halftone Ben-Day dot patterns covering every surface; bold thick black ink outlines on every street, building, and shape; posterized vibrant flat colors with magenta, electric blue, yellow, and red accents; kinetic graphic-novel stylization. Looks printed, not photographed. Preserve all street layouts, building footprints, parks, water, and roads exactly. Remove any watermarks, logos, copyright text, or labels — fill the entire frame with the comic-book aerial.",
  skyPrompt:
    "Replace this gradient with a Spider-Verse comic-book sky panorama: halftone Ben-Day dot clouds, posterized vibrant colors, bold black ink outlines on cloud edges, vibrant magenta and electric blue and yellow palette, kinetic graphic-novel feel. 2:1 equirectangular ratio, fill the entire frame with stylized comic sky — no ground, no buildings.",
  buildingsPaintPrompt:
    "Repaint ONLY the buildings in this 3D city scene as Spider-Verse comic-book facades: visible halftone Ben-Day dot patterns covering every wall; thick bold black ink outlines around windows and architectural details; posterized vibrant colors with magenta, electric blue, yellow, and red accents; comic-book stylization on every facade; kinetic graphic-novel feel. Keep the camera angle, building positions, ground, and sky unchanged — focus only on transforming the building surfaces into comic-book facades.",
  materials: {
    toonShading: true,
    groundTint: "#ffffff",
    buildingBase: "#8a8aa8",
    buildingHover: "#ff2a8a",
    buildingEmissive: "#ff2a8a",
    buildingEmissiveIntensity: 0.1,
  },
  sky: {
    sunPosition: [0.2, 0.6, 0.5],
    sunColor: "#ffffff",
    ambientColor: "#aab5d8",
    ambientIntensity: Math.PI * 0.8,
    skyInclination: 0.3,
    skyAzimuth: 0.4,
    fogColor: "#3a2a5a",
    fogDensity: 0.002,
    envPreset: "city",
  },
  postFX: {
    bloom: { enabled: true, intensity: 0.8, threshold: 0.6 },
    chromaticAberration: { enabled: true, offset: 0.004 },
    vignette: { enabled: true, darkness: 0.5, offset: 0.4 },
    noise: { enabled: true, opacity: 0.08 },
    outline: { enabled: false },
    grade: {
      enabled: true,
      hue: 0,
      saturation: 0.5,
      brightness: 0,
      contrast: 0.3,
    },
    posterize: { enabled: true, levels: 6 },
    pixelation: { enabled: false, granularity: 1 },
  },
};

const FILM_NOIR: StyleProfile = {
  id: "noir",
  name: "Film Noir",
  description: "High contrast B&W, hard shadows, fog. Detective vibes.",
  restylePrompt:
    "Reimagine this 3D city scene as a 1940s film noir frame: black and white, dramatic chiaroscuro lighting with deep shadows and bright highlights, heavy atmospheric fog and rain, glistening wet streets, neon signage just out of focus, hard angular shadows, slight film grain, very high contrast. Keep the architecture, geometry, composition, and camera angle identical.",
  groundTexturePrompt:
    "Completely transform this aerial photograph into a 1940s film noir black-and-white aerial. NOT a color photograph — a moody monochrome cinematic frame with: ONLY black, white, and gray (zero color saturation); dramatic high-contrast chiaroscuro; deep inky black shadows in alleyways and around buildings; bright white highlights on roads and rooftops; heavy 35mm film grain; gritty 1940s mood; like a still from Sin City or The Maltese Falcon shot from above. Preserve all street layouts, building footprints, parks, water, and roads exactly. Remove any watermarks, logos, copyright text, or labels — fill the entire frame with the noir aerial.",
  skyPrompt:
    "Replace this gradient with a 1940s film noir black-and-white sky panorama: heavy moody overcast cumulus clouds, dramatic chiaroscuro lighting, atmospheric 35mm film grain, deep inky shadows, gritty cinematic mood, monochrome only. 2:1 equirectangular ratio, fill the entire frame with B&W noir sky — no ground, no buildings.",
  buildingsPaintPrompt:
    "Repaint ONLY the buildings in this 3D city scene as 1940s film noir black-and-white facades: ONLY black white and gray (no color); dramatic high-contrast chiaroscuro on building walls; deep inky shadows in window recesses and between floors; bright white architectural highlights; heavy 35mm film grain on every surface; gritty 1940s mood. Keep the camera angle, building positions, ground, and sky unchanged — focus only on transforming the building surfaces into noir B&W facades.",
  materials: {
    toonShading: false,
    groundTint: "#7a7a7a",
    buildingBase: "#2a2a2a",
    buildingHover: "#cccccc",
    buildingEmissive: "#000000",
    buildingEmissiveIntensity: 0,
  },
  sky: {
    sunPosition: [-0.4, 0.2, 0.8],
    sunColor: "#dddddd",
    ambientColor: "#444444",
    ambientIntensity: Math.PI * 0.3,
    skyInclination: 0.6,
    skyAzimuth: 0.55,
    fogColor: "#222222",
    fogDensity: 0.012,
    envPreset: "night",
  },
  postFX: {
    bloom: { enabled: false, intensity: 0, threshold: 0.9 },
    chromaticAberration: { enabled: false, offset: 0 },
    vignette: { enabled: true, darkness: 0.85, offset: 0.25 },
    noise: { enabled: true, opacity: 0.12 },
    outline: { enabled: false },
    grade: {
      enabled: true,
      hue: 0,
      saturation: -1, // full desat
      brightness: -0.1,
      contrast: 0.6,
    },
    posterize: { enabled: false, levels: 8 },
    pixelation: { enabled: false, granularity: 1 },
  },
};

const GHIBLI: StyleProfile = {
  id: "ghibli",
  name: "Studio Ghibli",
  description: "Soft pastels, painterly skies, gentle dreamlike haze.",
  restylePrompt:
    "Reimagine this 3D city scene in the visual style of a Studio Ghibli film (Miyazaki, Howl's Moving Castle): soft watercolor painterly textures, dreamy pastel skies with billowing clouds, gentle dappled sunlight, hand-drawn organic linework, peaceful nostalgic mood, lush greenery, warm soft palette. Keep the architecture, geometry, composition, and camera angle identical.",
  groundTexturePrompt:
    "Completely transform this aerial photograph into a Studio Ghibli watercolor aerial illustration. NOT a photograph — a hand-painted watercolor map by Miyazaki: soft watercolor washes; gentle organic hand-drawn linework on streets; lush hand-painted greenery in parks; peaceful nostalgic palette of cream, sage green, soft sky blue, warm amber; visible paper texture; rough painted edges; everything looks brushed onto canvas. Preserve all street layouts, building footprints, parks, water, and roads exactly. Remove any watermarks, logos, copyright text, or labels — fill the entire frame with the painted aerial.",
  skyPrompt:
    "Replace this gradient with a Studio Ghibli watercolor sky panorama: dreamy pastel cumulus clouds painted with soft watercolor washes, peaceful nostalgic palette of pale blue and warm cream, gentle hand-painted texture as if on rough paper, hint of warm sunlight. 2:1 equirectangular ratio, fill the entire frame with painterly Ghibli sky — no ground, no buildings.",
  buildingsPaintPrompt:
    "Repaint ONLY the buildings in this 3D city scene as Studio Ghibli watercolor facades: soft watercolor washes on every wall; gentle organic hand-drawn linework around windows and architecture; peaceful nostalgic palette of cream, sage, soft blue, warm amber; visible paper texture; rough painted edges on facades; warm dappled sunlight. Keep the camera angle, building positions, ground, and sky unchanged — focus only on transforming the building surfaces into watercolor Ghibli facades.",
  materials: {
    toonShading: true,
    groundTint: "#d8e8c8",
    buildingBase: "#c8d8b8",
    buildingHover: "#88aacc",
    buildingEmissive: "#000000",
    buildingEmissiveIntensity: 0,
  },
  sky: {
    sunPosition: [0.4, 0.9, 0.3],
    sunColor: "#fff8e0",
    ambientColor: "#d8e8f8",
    ambientIntensity: Math.PI * 1.0,
    skyInclination: 0.15,
    skyAzimuth: 0.35,
    fogColor: "#dceaf8",
    fogDensity: 0.0025,
    envPreset: "park",
  },
  postFX: {
    bloom: { enabled: true, intensity: 0.5, threshold: 0.75 },
    chromaticAberration: { enabled: false, offset: 0 },
    vignette: { enabled: true, darkness: 0.2, offset: 0.5 },
    noise: { enabled: false, opacity: 0 },
    outline: { enabled: false },
    grade: {
      enabled: true,
      hue: 0.02,
      saturation: -0.05,
      brightness: 0.1,
      contrast: -0.05,
    },
    posterize: { enabled: false, levels: 10 },
    pixelation: { enabled: false, granularity: 1 },
  },
};

const CYBERPUNK: StyleProfile = {
  id: "cyberpunk",
  name: "Cyberpunk Rain",
  description: "Neon, magenta-cyan, heavy bloom, wet streets, dystopian night.",
  restylePrompt:
    "Reimagine this 3D city scene as a Blade Runner 2049 / cyberpunk dystopia: nighttime, magenta and cyan neon lights, holographic advertisements bleeding into wet rain-slicked streets, heavy atmospheric haze with light shafts, lens flares, dense bloom on light sources, towering megastructures, dystopian gritty atmosphere. Keep the architecture, geometry, composition, and camera angle identical.",
  groundTexturePrompt:
    "Completely transform this aerial photograph into a cyberpunk dystopia nighttime aerial. NOT a daytime photograph — a Blade Runner 2049 nighttime aerial illustration with: pitch-dark base; vivid magenta and cyan neon lights bleeding from every street and rooftop; wet rain-slicked surfaces reflecting holographic light; flickering neon signs; dense atmospheric haze with light shafts; dystopian sci-fi mood. Roads glow with neon, buildings are silhouetted with neon edges. Preserve all street layouts, building footprints, parks, water, and roads exactly. Remove any watermarks, logos, copyright text, or labels — fill the entire frame with the cyberpunk aerial.",
  skyPrompt:
    "Replace this gradient with a cyberpunk dystopia sky panorama: ominous dark stormy clouds with magenta and cyan neon glow bleeding through, atmospheric rain haze, dystopian Blade Runner 2049 aesthetic, lens flares from distant flying vehicles, neon-tinted purple and blue palette. 2:1 equirectangular ratio, fill the entire frame with stormy cyberpunk sky — no ground, no buildings.",
  buildingsPaintPrompt:
    "Repaint ONLY the buildings in this 3D city scene as Blade Runner 2049 cyberpunk megastructures at night: dark base; vivid magenta and cyan neon strips and signage on every facade; holographic advertisements glowing on building sides; wet rain-slicked surfaces reflecting neon; dense atmospheric haze; dystopian gritty cyberpunk facades; flickering neon light. Keep the camera angle, building positions, ground, and sky unchanged — focus only on transforming the building surfaces into cyberpunk neon facades.",
  materials: {
    toonShading: false,
    groundTint: "#332244",
    buildingBase: "#1a1a2e",
    buildingHover: "#ff2a8a",
    buildingEmissive: "#ff2a8a",
    buildingEmissiveIntensity: 0.5,
  },
  sky: {
    sunPosition: [0, -0.2, 1],
    sunColor: "#aa44ff",
    ambientColor: "#220a3a",
    ambientIntensity: Math.PI * 0.3,
    skyInclination: 0.85,
    skyAzimuth: 0.1,
    fogColor: "#1a0a2a",
    fogDensity: 0.015,
    envPreset: "night",
  },
  postFX: {
    bloom: { enabled: true, intensity: 2.0, threshold: 0.4 },
    chromaticAberration: { enabled: true, offset: 0.0025 },
    vignette: { enabled: true, darkness: 0.8, offset: 0.3 },
    noise: { enabled: true, opacity: 0.1 },
    outline: { enabled: false },
    grade: {
      enabled: true,
      hue: 0.15,
      saturation: 0.6,
      brightness: -0.2,
      contrast: 0.5,
    },
    posterize: { enabled: false, levels: 8 },
    pixelation: { enabled: false, granularity: 1 },
  },
};

export const STYLE_PRESETS: StyleProfile[] = [
  REALISTIC,
  PIXAR_DAYTIME,
  ARCANE_TWILIGHT,
  WES_ANDERSON,
  SPIDER_VERSE,
  FILM_NOIR,
  GHIBLI,
  CYBERPUNK,
];

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

type StyleStore = {
  activeId: string;
  active: StyleProfile;

  setActiveById: (id: string) => void;
  setActive: (profile: StyleProfile) => void;
};

export const useStyleStore = create<StyleStore>((set) => ({
  activeId: REALISTIC.id,
  active: REALISTIC,

  setActiveById: (id) => {
    const p = STYLE_PRESETS.find((s) => s.id === id) || REALISTIC;
    set({ activeId: p.id, active: p });
  },

  setActive: (profile) => set({ activeId: profile.id, active: profile }),
}));
