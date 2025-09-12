import type { Alphabet } from './convert';

/**
 * Uppercase and alphabet-specific normalization for text input.
 * - Trims outer whitespace
 * - Uppercases letters
 * - Collapses multiple whitespace into a single space
 * - RUS: replaces Ё with Е by default
 */
export function normalizeText(input: string, alphabet: Alphabet): string {
  let s = input.trim();
  // Arabic: keep lowercase, strip diacritics, normalize variants
  if (alphabet === 'AR') {
    // Remove tashkeel and tatweel
    s = s.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
    // Normalize alef forms and hamza chairs
    s = s
      .replace(/[\u0622\u0623\u0625]/g, '\u0627') // آ/أ/إ -> ا
      .replace(/\u0629/g, '\u0647')                // ة -> ه
      .replace(/\u0649/g, '\u064A')                // ى -> ي
      .replace(/\u0624/g, '\u0648')                // ؤ -> و
      .replace(/\u0626/g, '\u064A');               // ئ -> ي
  }
  // Preserve German ß by mapping to uppercase ẞ before uppercasing
  if (alphabet === 'DEU') {
    s = s.replaceAll('ß', 'ẞ');
  }
  if (!(alphabet === 'AR')) {
    s = s.toUpperCase();
  }
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
