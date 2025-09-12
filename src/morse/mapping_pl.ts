import { MAP_FWD as ITU_BASE } from './mapping_itu';

export const MAP_FWD: Record<string, string> = {
  ...ITU_BASE,
  'Ł': '.-..-',
  'Ś': '...-...',
  'Ź': '--..-.',
  'Ż': '--..'
};

// Build reverse without overriding base ITU collisions (e.g., Ż shares code with Z)
const baseRev = Object.fromEntries(
  Object.entries(ITU_BASE).map(([ch, code]) => [code, ch])
) as Record<string, string>;

const extras: Array<[string, string]> = [
  ['Ł', '.-..-'],
  ['Ś', '...-...'],
  ['Ź', '--..-.'],
  // Do not override '--..' which maps to 'Z'
];

for (const [ch, code] of extras) {
  if (!(code in baseRev)) baseRev[code] = ch;
}

export const MAP_REV: Record<string, string> = baseRev;


