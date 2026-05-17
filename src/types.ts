export interface IconSlice {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
}

export interface GridConfig {
  rows: number;
  cols: number;
}

export type AppMode = 'START' | 'GENERATE' | 'EDIT' | 'CROP' | 'SLICE' | 'ASSETS' | 'HISTORY';

export interface ImageState {
  originalUrl: string;
  processedUrl: string;
  history: string[];
  historyIndex: number;
}

export interface GenerationConfig {
  prompt: string;
  style: string;
  gridSize: string;
  iconSize: string;
}

export const STYLE_PRESETS = [
  { id: 'fantasy', name: 'Fantasy RPG', prompt: 'fantasy RPG item icons, wood and stone materials, high detail, isometric' },
  { id: 'scifi', name: 'Sci-Fi / Tech', prompt: 'sci-fi game icons, metallic tech parts, neon glows, futuristic' },
  { id: 'pixel', name: 'Pixel Art', prompt: 'pixel art sprite sheet, 32-bit style, vibrant colors' },
  { id: 'minimal', name: 'Minimalist Line', prompt: 'minimalist outline icons, clean lines, black and white' },
  { id: '3d-clay', name: '3D Clay', prompt: 'cute 3d clay style icons, soft lighting, vibrant colors' },
  { id: 'flat', name: 'Flat Vector', prompt: 'modern flat vector icons, clean shapes, professional' },
];
