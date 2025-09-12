import { MAP_FWD as RUS_BASE } from './mapping_ru';

export const MAP_FWD: Record<string, string> = {
  ...RUS_BASE,
  'Ў': '..--.'
};

export const MAP_REV: Record<string, string> = Object.fromEntries(
  Object.entries(MAP_FWD).map(([char, code]) => [code, char])
) as Record<string, string>;


