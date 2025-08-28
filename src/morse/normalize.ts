import type { Alphabet } from './convert';

/**
 * Uppercase and alphabet-specific normalization for text input.
 * - Trims outer whitespace
 * - Uppercases letters
 * - Collapses multiple whitespace into a single space
 * - RUS: replaces Ё with Е by default
 */
export function normalizeText(input: string, alphabet: Alphabet): string {
  let s = input.trim().toUpperCase();
  if (alphabet === 'RUS') {
    s = s.replaceAll('Ё', 'Е');
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Normalizes morse input:
 * - Replaces typographic dot/dash (·/• → ., –/— → -)
 * - Treats backslash (\\) as word separator alias → '/'
 * - Removes invalid characters (keeps only . - / and spaces)
 * - Converts 2+ spaces into ' / ' as word separators
 * - Ensures single spaces between symbols and spaces around '/'
 */
export function normalizeMorse(input: string): string {
  let s = input
    .replace(/[·•]/g, '.')
    .replace(/[–—]/g, '-')
    .replace(/\t/g, ' ')
    .replace(/\\/g, '/');

  // Keep only ., -, /, and whitespace
  s = s.replace(/[^.\-\/\s]/g, '');

  // Normalize spaces around slashes first
  s = s.replace(/\s*\/\s*/g, ' / ');

  // Convert 2+ spaces (not already around a slash) into word separators
  s = s.replace(/ {2,}/g, ' / ');

  // Collapse multiple spaces to single
  s = s.replace(/\s+/g, ' ').trim();

  // Ensure slashes have single spaces around
  s = s.replace(/\s*\/\s*/g, ' / ');

  return s;
}
