import { MAP_FWD as ITU_FWD, MAP_REV as ITU_REV } from './mapping_itu';
import { MAP_FWD as ENG_FWD, MAP_REV as ENG_REV } from './mapping_eng';
import { MAP_FWD as RUS_FWD, MAP_REV as RUS_REV } from './mapping_ru';
import { normalizeMorse, normalizeText } from './normalize';

export type Alphabet = 'ITU' | 'ENG' | 'RUS';

export interface ConvertOptions {
  alphabet: Alphabet;
  unknownChar?: string; // default: '□'
}

function getMaps(alphabet: Alphabet): { fwd: Record<string, string>; rev: Record<string, string> } {
  switch (alphabet) {
    case 'ENG':
      return { fwd: ENG_FWD, rev: ENG_REV };
    case 'RUS':
      return { fwd: RUS_FWD, rev: RUS_REV };
    case 'ITU':
    default:
      return { fwd: ITU_FWD, rev: ITU_REV };
  }
}

/**
 * Converts Text to Morse.
 * - Letters are separated by ' '
 * - Words are separated by ' / '
 * - Unknown characters become unknownChar (default '□')
 */
export function textToMorse(input: string, opts: ConvertOptions): string {
  const { alphabet } = opts;
  const unknownChar = opts.unknownChar ?? '□';
  const { fwd } = getMaps(alphabet);
  const norm = normalizeText(input, alphabet);
  if (!norm) return '';

  const words = norm.split(/\s+/);
  const encodedWords: string[] = [];

  for (const word of words) {
    if (!word) continue;
    const symbols: string[] = [];
    for (let i = 0; i < word.length; i += 1) {
      const char = word[i];
      const morse = fwd[char];
      symbols.push(morse ?? unknownChar);
    }
    encodedWords.push(symbols.join(' '));
  }

  return encodedWords.join(' / ');
}

/**
 * Converts Morse to Text.
 * - Normalizes . and -
 * - 2+ spaces are treated as word separator ' / '
 * - Unknown sequences become unknownChar (default '□')
 */
export function morseToText(input: string, opts: ConvertOptions): string {
  const { alphabet } = opts;
  const unknownChar = opts.unknownChar ?? '□';
  const { rev } = getMaps(alphabet);
  const norm = normalizeMorse(input);
  if (!norm) return '';

  const words = norm.split(' / ');
  const decodedWords: string[] = [];

  for (const word of words) {
    if (!word) continue;
    const codes = word.split(' ');
    const letters: string[] = [];
    for (const code of codes) {
      if (!code) continue;
      const ch = rev[code];
      letters.push(ch ?? unknownChar);
    }
    decodedWords.push(letters.join(''));
  }

  return decodedWords.join(' ');
}
