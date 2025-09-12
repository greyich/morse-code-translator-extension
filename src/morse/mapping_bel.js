import { MAP_FWD as RUS_BASE } from './mapping_ru.js';

export const MAP_FWD = {
  ...RUS_BASE,
  'Ў': '..--.'
};

export const MAP_REV = Object.fromEntries(
  Object.entries(MAP_FWD).map(([char, code]) => [code, char])
);


