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
  id?: string;
  gridSize: string;
  iconSize: string;
  preferredEngine?: 'GEMINI' | 'STABILITY' | 'STABILITY_CORE';
  // New fields for guided generation
  field?: string;
  mascotType?: string;
  category?: string;
  colorTheme?: string;
  useCustomPrompt?: boolean;
}

export const STYLE_PRESETS = [
  { id: 'fantasy', name: 'Fantasy RPG', description: 'Wood, stone, and iron materials with magical glows. High-contrast isometric assets.', prompt: 'fantasy RPG item icons, wood and stone materials, high detail, isometric' },
  { id: 'scifi', name: 'Sci-Fi / Tech', description: 'Metallic surfaces, futuristic tech components, and vibrant neon accents.', prompt: 'sci-fi game icons, metallic tech parts, neon glows, futuristic' },
  { id: 'pixel', name: 'Pixel Art', description: 'Retro 32-bit aesthetic. Low resolution but high character and color vibrancy.', prompt: 'pixel art sprite sheet, 32-bit style, vibrant colors' },
  { id: 'minimal', name: 'Minimalist Line', description: 'Clean, professional vector outlines. Best for UI and modern app interfaces.', prompt: 'minimalist outline icons, clean lines, black and white' },
  { id: '3d-clay', name: '3D Clay', description: 'Soft, tactile, and playful. Uses subsurface scattering for a toy-like feel.', prompt: 'cute 3d clay style icons, soft lighting, vibrant colors' },
  { id: 'flat', name: 'Flat Vector', description: 'Modern illustrative style with bold colors and clean geometric shapes.', prompt: 'modern flat vector icons, clean shapes, professional' },
  { id: 'custom', name: 'Custom', description: 'Define your own style rules below.', prompt: '' },
];
