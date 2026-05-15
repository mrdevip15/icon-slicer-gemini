import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const APP_NAME = "IconSlicer AI";

export function formatPrompt(params: { prompt: string, style: string, gridSize: string, iconSize: string }) {
  return `A ${params.gridSize} grid of ${params.iconSize} icon sheet featuring ${params.prompt}. Style: ${params.style}. Consistent style across all icons, transparent background, centered layout, no text, no watermarks, professional asset sheet.`;
}
