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

  return `Professional game sprite sheet of exactly ${count} separate, unique, and variation-rich ${params.prompt} icons.
Layout: A perfectly aligned ${params.gridSize} grid (${cols}x${cols}).
Constraint: Each individual asset must be strictly centered within its designated ${cols}x${cols} grid cell. Provide clear padding and empty space around each item to ensure no assets overlap or touch each other.
Style: ${params.style}.
Technical: Consistent perspective and lighting across all items, clean solid neutral background, high resolution 4k, sharp masterwork details.
Safety: No text, no labels, no watermarks, no borders, no frames. Each asset must be a standalone object.`;
}
