import { MAP_FWD as ITU_FWD, MAP_REV as ITU_REV } from './mapping_itu.js';
import { MAP_FWD as ENG_FWD, MAP_REV as ENG_REV } from './mapping_eng.js';
import { MAP_FWD as RUS_FWD, MAP_REV as RUS_REV } from './mapping_ru.js';
import { normalizeMorse, normalizeText } from './normalize.js';

function getMaps(alphabet) {
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

export function textToMorse(input, opts) {
  const { alphabet } = opts;
  const unknownChar = opts.unknownChar ?? '□';
  const { fwd } = getMaps(alphabet);
  const norm = normalizeText(input, alphabet);
  if (!norm) return '';
  const words = norm.split(/\s+/);
  const encodedWords = [];
  for (const word of words) {
    if (!word) continue;
    const symbols = [];
    for (let i = 0; i < word.length; i += 1) {
      const char = word[i];
      const morse = fwd[char];
      symbols.push(morse ?? unknownChar);
    }
    encodedWords.push(symbols.join(' '));
  }
  return encodedWords.join(' / ');
}

export function morseToText(input, opts) {
  const { alphabet } = opts;
  const unknownChar = opts.unknownChar ?? '□';
  const { rev } = getMaps(alphabet);
  const norm = normalizeMorse(input);
  if (!norm) return '';
  const words = norm.split(' / ');
  const decodedWords = [];
  for (const word of words) {
    if (!word) continue;
    const codes = word.split(' ');
    const letters = [];
    for (const code of codes) {
      if (!code) continue;
      const ch = rev[code];
      letters.push(ch ?? unknownChar);
    }
    decodedWords.push(letters.join(''));
  }
  return decodedWords.join(' ');
}
