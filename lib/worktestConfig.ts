export type DifficultyLevel = "easy" | "medium" | "hard";

export interface WorktestSpecs {
  title: string;
  maxTriangles: number;
  maxMaterials: number;
  maxFileSize: number;
  dimensions: string;
}

export const SOFA_WORKTEST_CONFIG: Record<DifficultyLevel, WorktestSpecs> = {
  easy: {
    title: "Easy Worktest - Retro Sofa",
    maxTriangles: 50000,
    maxMaterials: 3,
    maxFileSize: 8,
    dimensions:
      "Width: 176 cm, Depth: 81 cm, Height: 77 cm, Seat Width: 143 cm, Seat Depth: 65 cm, Seat Height: 43 cm, Leg Height: 22 cm, Backrest Height: 36 cm",
  },
  medium: {
    title: "Medium Worktest - Rattan Sofa",
    maxTriangles: 100000,
    maxMaterials: 4,
    maxFileSize: 12,
    dimensions:
      "3-Seater: Length: 180 cm, Width: 70 cm, Armrest Height: 50 cm, Total Height: 80 cm",
  },
  hard: {
    title: "Hard Worktest - Woven Rattan Sofa",
    maxTriangles: 150000,
    maxMaterials: 5,
    maxFileSize: 15,
    dimensions:
      "Width:192cm, Depth:65cm, Height:74cm, Seat Width:178cm, Seat Depth:45cm, Seat Cushion Height:14cm, Seat Height:46cm, Leg Height:25cm",
  },
};

export const SOFA_REFERENCE_IMAGES: Record<DifficultyLevel, string[]> = {
  easy: [
    "https://cdn2.charpstar.net/Worktest/Easy/1.webp",
    "https://cdn2.charpstar.net/Worktest/Easy/2.webp",
    "https://cdn2.charpstar.net/Worktest/Easy/3.webp",
    "https://cdn2.charpstar.net/Worktest/Easy/5.webp",
    "https://cdn2.charpstar.net/Worktest/Easy/6.webp",
  ],
  medium: [
    "https://cdn2.charpstar.net/Worktest/Medium/1.webp",
    "https://cdn2.charpstar.net/Worktest/Medium/2.webp",
    "https://cdn2.charpstar.net/Worktest/Medium/3.webp",
    "https://cdn2.charpstar.net/Worktest/Medium/4.webp",
    "https://cdn2.charpstar.net/Worktest/Medium/5.webp",
  ],
  hard: [
    "https://cdn2.charpstar.net/Worktest/Hard/1.webp",
    "https://cdn2.charpstar.net/Worktest/Hard/2.webp",
    "https://cdn2.charpstar.net/Worktest/Hard/3.webp",
    "https://cdn2.charpstar.net/Worktest/Hard/4.webp",
    "https://cdn2.charpstar.net/Worktest/Hard/5.webp",
  ],
};

/** Glasses / Eyewear worktest config (CharpstAR 3D Artist Worktest 2025) */
export const GLASSES_WORKTEST_CONFIG: Record<DifficultyLevel, WorktestSpecs> = {
  easy: {
    title: "Easy Worktest - Eyewear",
    maxTriangles: 50000,
    maxMaterials: 3,
    maxFileSize: 8,
    dimensions:
      "Nose bridge: 14 mm, Glass width: 58 mm, Temple length: 135 mm.",
  },
  medium: {
    title: "Medium Worktest - Eyewear",
    maxTriangles: 100000,
    maxMaterials: 4,
    maxFileSize: 12,
    dimensions:
      "Total width: 141 mm, Nose bridge: 22 mm, Glass width: 50 mm, Glass height: 40 mm, Temple length: 150 mm.",
  },
  hard: {
    title: "Hard Worktest - Eyewear",
    maxTriangles: 150000,
    maxMaterials: 5,
    maxFileSize: 15,
    dimensions: "Glass width: 39 mm, Temple length: 138 mm.",
  },
};

/** Reference images for glasses worktest (from worktest HTML) */
export const GLASSES_REFERENCE_IMAGES: Record<DifficultyLevel, string[]> = {
  easy: [
    "https://demosetc.b-cdn.net/Worktest/Easy/79965-0.jpg",
    "https://demosetc.b-cdn.net/Worktest/Easy/all_views.png",
  ],
  medium: [
    "https://demosetc.b-cdn.net/Worktest/Medium/74654-0.jpg",
    "https://demosetc.b-cdn.net/Worktest/Medium/74654-1.jpg",
    "https://demosetc.b-cdn.net/Worktest/Medium/74654-2.jpg",
  ],
  hard: [
    "https://demosetc.b-cdn.net/Worktest/Hard/89297-0.jpg",
    "https://demosetc.b-cdn.net/Worktest/Hard/all_views_hard.png",
  ],
};

export const GLASSES_MESH_NAMING = [
  "geo_glass",
  "geo_frame",
  "geo_nosepad",
  "geo_lens",
] as const;
