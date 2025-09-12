import { MAP_FWD as ITU_BASE } from './mapping_itu.js';

export const MAP_FWD = {
  ...ITU_BASE,
  'Å': '.--.-',
  'Æ': '.-.-',
  'Ø': '---.'
};

export const MAP_REV = Object.fromEntries(
  Object.entries(MAP_FWD).map(([char, code]) => [code, char])
);


