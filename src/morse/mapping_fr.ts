import { MAP_FWD as ITU_BASE } from './mapping_itu';

// French extensions merged over ITU
export const MAP_FWD: Record<string, string> = {
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
  // 'Û' shares code with '2' (..---) → only forward map, keep REV to '2'
  'Û': '..---',
  'Œ': '----'
};

// Build reverse: start from ITU reverse mapping, then add extras except 'Û' collision
const baseRev = Object.fromEntries(
  Object.entries(ITU_BASE).map(([ch, code]) => [code, ch])
) as Record<string, string>;

const extras: Array<[string, string]> = [
  ['À', '.--.-.'],
  ['Â', '.-.-.'],
  ['Æ', '.-.-'],
  ['Ç', '-.-..'],
  ['É', '..-..'],
  ['È', '.-..-'],
  ['Ê', '-.-...'],
  ['Ô', '---.'],
  ['Ù', '..--.'],
  // Skip 'Û' to keep '..---' → '2'
  ['Œ', '----']
];

for (const [ch, code] of extras) {
  // Only set if not present
  if (!(code in baseRev)) baseRev[code] = ch;
}

export const MAP_REV: Record<string, string> = baseRev;


