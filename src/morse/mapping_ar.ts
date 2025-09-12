import { MAP_FWD as ITU_BASE } from './mapping_itu';

// Arabic Morse mapping (letters only; RTL input but LTR Morse symbols)
export const MAP_FWD: Record<string, string> = {
  ...ITU_BASE,
  'ا': '.-',
  'ب': '-...',
  'ت': '-',
  'ث': '-.-.',
  'ج': '.--',
  'ح': '....',
  'خ': '---.',
  'د': '-..',
  'ذ': '--.',
  'ر': '.-.',
  'ز': '--..',
  'س': '...',
  'ش': '---',
  'ص': '--.-',
  'ض': '-..-',
  'ط': '--',
  'ظ': '-.--',
  'ع': '.-.-',
  'غ': '--.',
  'ف': '..-.',
  'ق': '--.-',
  'ك': '-.-',
  'ل': '.-..',
  'م': '--',
  'ن': '-.',
  'ه': '....',
  'و': '.--',
  'ي': '..'
};

export const MAP_REV: Record<string, string> = Object.fromEntries(
  Object.entries(MAP_FWD).map(([char, code]) => [code, char])
) as Record<string, string>;


