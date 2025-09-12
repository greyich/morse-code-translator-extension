import { MAP_FWD as ITU_BASE } from './mapping_itu.js';

export const MAP_FWD = {
  ...ITU_BASE,
  'À': '.--.-.',
  'Â': '.-.-.',
  'Æ': '.-.-',
  'Ç': '-.-..',
  'É': '..-..',
  'È': '.-..-',
  'Ê': '-.-...',
  'Ô': '---.',
  'Ù': '..--.',
  'Û': '..---',
  'Œ': '----'
};

const baseRev = Object.fromEntries(
  Object.entries(ITU_BASE).map(([ch, code]) => [code, ch])
);

const extras = [
  ['À', '.--.-.'],
  ['Â', '.-.-.'],
  ['Æ', '.-.-'],
  ['Ç', '-.-..'],
  ['É', '..-..'],
  ['È', '.-..-'],
  ['Ê', '-.-...'],
  ['Ô', '---.'],
  ['Ù', '..--.'],
  // Do not override '..---' to keep '2'
  ['Œ', '----']
];

for (const [ch, code] of extras) {
  if (!(code in baseRev)) baseRev[code] = ch;
}

export const MAP_REV = baseRev;


