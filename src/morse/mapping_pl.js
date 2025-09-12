import { MAP_FWD as ITU_BASE } from './mapping_itu.js';

export const MAP_FWD = {
  ...ITU_BASE,
  'Ł': '.-..-',
  'Ś': '...-...',
  'Ź': '--..-.',
  'Ż': '--..'
};

const baseRev = Object.fromEntries(
  Object.entries(ITU_BASE).map(([ch, code]) => [code, ch])
);

const extras = [
  ['Ł', '.-..-'],
  ['Ś', '...-...'],
  ['Ź', '--..-.']
  // Do not override '--..' (Z)
];

for (const [ch, code] of extras) {
  if (!(code in baseRev)) baseRev[code] = ch;
}

export const MAP_REV = baseRev;


