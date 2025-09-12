import { MAP_FWD as ITU_BASE } from './mapping_itu';

export const MAP_FWD: Record<string, string> = {
  ...ITU_BASE,
  'Ä': '.-.-',
  'Ö': '---.',
  'Ü': '..--',
  'ẞ': '...--..'
};

export const MAP_REV: Record<string, string> = Object.fromEntries(
  Object.entries(MAP_FWD).map(([char, code]) => [code, char])
) as Record<string, string>;


