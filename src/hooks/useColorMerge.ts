/**
 * Hook for color manipulation utilities
 * Extracts color-related logic from ProjectDetail
 */

import { useCallback } from 'react';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex: string): RGB | null {
  // Handle 6-digit hex
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }

  // Handle 3-digit hex
  const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (shortResult) {
    return {
      r: parseInt(shortResult[1] + shortResult[1], 16),
      g: parseInt(shortResult[2] + shortResult[2], 16),
      b: parseInt(shortResult[3] + shortResult[3], 16),
    };
  }

  return null;
}

/**
 * Convert RGB to hex color
 */
export function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    case b:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return { h, s, l };
}

/**
 * Calculate Euclidean distance between two colors in RGB space
 */
export function colorDistance(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return Infinity;

  const dr = rgb1.r - rgb2.r;
  const dg = rgb1.g - rgb2.g;
  const db = rgb1.b - rgb2.b;

  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Calculate perceptual color difference using weighted Euclidean
 * More accurate for human perception
 */
export function perceptualColorDistance(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return Infinity;

  // Weighted factors for human color perception
  const dr = rgb1.r - rgb2.r;
  const dg = rgb1.g - rgb2.g;
  const db = rgb1.b - rgb2.b;
  const rMean = (rgb1.r + rgb2.r) / 2;

  // Weights based on how humans perceive color differences
  const weightR = 2 + rMean / 256;
  const weightG = 4.0;
  const weightB = 2 + (255 - rMean) / 256;

  return Math.sqrt(weightR * dr * dr + weightG * dg * dg + weightB * db * db);
}

/**
 * Merge similar colors based on distance threshold
 */
export function mergeSimilarColors(colors: string[], threshold: number = 30): string[] {
  if (colors.length === 0) return [];

  const merged: string[] = [];
  const used = new Set<number>();

  for (let i = 0; i < colors.length; i++) {
    if (used.has(i)) continue;

    // Keep this color as representative
    merged.push(colors[i]);
    used.add(i);

    // Mark all similar colors as used
    for (let j = i + 1; j < colors.length; j++) {
      if (used.has(j)) continue;
      if (colorDistance(colors[i], colors[j]) < threshold) {
        used.add(j);
      }
    }
  }

  return merged;
}

/**
 * Calculate luminance for contrast ratio calculation
 */
export function getLuminance(color: string): number {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;

  const sRGB = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((v) => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

/**
 * Calculate contrast ratio between two colors (WCAG standard)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if color is light or dark
 */
export function isLightColor(color: string): boolean {
  return getLuminance(color) > 0.179;
}

/**
 * Sort colors by hue
 */
export function sortByHue(colors: string[]): string[] {
  return [...colors].sort((a, b) => {
    const rgbA = hexToRgb(a);
    const rgbB = hexToRgb(b);
    if (!rgbA || !rgbB) return 0;

    const hslA = rgbToHsl(rgbA);
    const hslB = rgbToHsl(rgbB);

    return hslA.h - hslB.h;
  });
}

/**
 * Sort colors by lightness
 */
export function sortByLightness(colors: string[]): string[] {
  return [...colors].sort((a, b) => {
    const rgbA = hexToRgb(a);
    const rgbB = hexToRgb(b);
    if (!rgbA || !rgbB) return 0;

    const hslA = rgbToHsl(rgbA);
    const hslB = rgbToHsl(rgbB);

    return hslA.l - hslB.l;
  });
}

export interface UseColorMergeResult {
  // Merge colors
  mergeColors: (colors: string[], threshold?: number) => string[];

  // Analysis
  getTextColor: (backgroundColor: string) => string;
  hasGoodContrast: (foreground: string, background: string, level?: 'AA' | 'AAA') => boolean;

  // Utilities
  hexToRgb: typeof hexToRgb;
  rgbToHex: typeof rgbToHex;
  colorDistance: typeof colorDistance;
  isLightColor: typeof isLightColor;
  sortByHue: typeof sortByHue;
  sortByLightness: typeof sortByLightness;
}

/**
 * Hook for color manipulation and merging
 *
 * @example
 * const { mergeColors, getTextColor } = useColorMerge();
 * const mergedPalette = mergeColors(rawColors, 25);
 * const textColor = getTextColor('#1a1a1a'); // Returns '#ffffff'
 */
export function useColorMerge(): UseColorMergeResult {
  const mergeColors = useCallback(
    (colors: string[], threshold: number = 30) => mergeSimilarColors(colors, threshold),
    []
  );

  const getTextColor = useCallback((backgroundColor: string): string => {
    return isLightColor(backgroundColor) ? '#000000' : '#ffffff';
  }, []);

  const hasGoodContrast = useCallback(
    (foreground: string, background: string, level: 'AA' | 'AAA' = 'AA'): boolean => {
      const ratio = getContrastRatio(foreground, background);
      return level === 'AAA' ? ratio >= 7 : ratio >= 4.5;
    },
    []
  );

  return {
    mergeColors,
    getTextColor,
    hasGoodContrast,
    hexToRgb,
    rgbToHex,
    colorDistance,
    isLightColor,
    sortByHue,
    sortByLightness,
  };
}
