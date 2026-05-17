import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { GenerationConfig } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const APP_NAME = "IconSlicer AI";

export function formatPrompt(params: GenerationConfig) {
  const count = params.gridSize === '4x4' ? 16 : params.gridSize === '8x8' ? 64 : 1;
  const cols = params.gridSize === '4x4' ? 4 : params.gridSize === '8x8' ? 8 : 1;
  
  let basePrompt = params.prompt;
  let prefix = "game sprite sheet";
  
  // Construct guided prompt if not in custom mode
  if (!params.useCustomPrompt && params.field && params.mascotType) {
    const colorPart = params.colorTheme ? ` with a ${params.colorTheme} color palette` : '';
    const categoryPart = params.category ? ` for ${params.category}` : '';
    
    // Set appropriate prefix based on category
    if (params.category === 'Website') {
      prefix = "website asset sheet";
    } else if (params.category === 'Mobile App') {
      prefix = "mobile app icon sheet";
    } else {
      prefix = "game sprite sheet";
    }

    basePrompt = `${params.field} themed ${params.mascotType} mascots and items${categoryPart}${colorPart}`;
  }

  if (params.gridSize === 'single') {
    const singlePrefix = params.category === 'Website' ? "website icon" : params.category === 'Mobile App' ? "app icon" : "game asset";
    return `A single ${params.iconSize} ${singlePrefix} of ${basePrompt}. Style: ${params.style}. Professional quality, transparent background, centered.`;
  }

  return `Professional ${prefix} of exactly ${count} separate, unique, and variation-rich ${basePrompt} icons.
Layout: A perfectly aligned ${params.gridSize} grid (${cols}x${cols}).
Constraint: Each individual asset must be strictly centered within its designated ${cols}x${cols} grid cell. Provide clear padding and empty space around each item to ensure no assets overlap or touch each other.
Style: ${params.style}.
Technical: Consistent perspective and lighting across all items, clean solid neutral background, sharp masterwork details.
Safety: No text, no labels, no watermarks, no borders, no frames. Each asset must be a standalone object.`;
}
