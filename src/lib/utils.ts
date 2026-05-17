import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const APP_NAME = "IconSlicer AI";

export function formatPrompt(params: { prompt: string, style: string, gridSize: string, iconSize: string }) {
  const count = params.gridSize === '4x4' ? 16 : params.gridSize === '8x8' ? 64 : 1;
  const cols = params.gridSize === '4x4' ? 4 : params.gridSize === '8x8' ? 8 : 1;
  
  if (params.gridSize === 'single') {
    return `A single high-quality ${params.iconSize} icon of ${params.prompt}. Style: ${params.style}. Professional game asset, transparent background, centered, high resolution.`;
  }

  return `Professional game sprite sheet of exactly ${count} separate and unique ${params.prompt} icons.
Layout: Perfectly organized ${params.gridSize} grid (${cols}x${cols}).
Style: ${params.style}.
Technical: Centered icons, consistent lighting, clean solid background, high resolution, sharp details.
Constraint: No text, no watermarks, no borders between items, sufficient spacing for slicing.`;
}
