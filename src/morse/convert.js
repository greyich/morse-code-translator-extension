import { MAP_FWD as ITU_FWD, MAP_REV as ITU_REV } from './mapping_itu.js';
import { MAP_FWD as ENG_FWD, MAP_REV as ENG_REV } from './mapping_eng.js';
import { MAP_FWD as RUS_FWD, MAP_REV as RUS_REV } from './mapping_ru.js';
import { MAP_FWD as DEU_FWD, MAP_REV as DEU_REV } from './mapping_de.js';
import { MAP_FWD as FRA_FWD, MAP_REV as FRA_REV } from './mapping_fr.js';
import { MAP_FWD as ESP_FWD, MAP_REV as ESP_REV } from './mapping_es.js';
import { MAP_FWD as ITA_FWD, MAP_REV as ITA_REV } from './mapping_it.js';
import { MAP_FWD as SWE_FWD, MAP_REV as SWE_REV } from './mapping_swe.js';
import { MAP_FWD as DAN_FWD, MAP_REV as DAN_REV } from './mapping_dan.js';
import { MAP_FWD as NOR_FWD, MAP_REV as NOR_REV } from './mapping_nor.js';
import { MAP_FWD as FIN_FWD, MAP_REV as FIN_REV } from './mapping_fin.js';
import { MAP_FWD as POL_FWD, MAP_REV as POL_REV } from './mapping_pl.js';
import { MAP_FWD as BEL_FWD, MAP_REV as BEL_REV } from './mapping_bel.js';
import { MAP_FWD as GRE_FWD, MAP_REV as GRE_REV } from './mapping_gre.js';
import { MAP_FWD as AR_FWD, MAP_REV as AR_REV } from './mapping_ar.js';
import { normalizeMorse, normalizeText } from './normalize.js';

function getMaps(alphabet) {
  switch (alphabet) {
    case 'ENG':
      return { fwd: ENG_FWD, rev: ENG_REV };
    case 'RUS':
      return { fwd: RUS_FWD, rev: RUS_REV };
    case 'DEU':
      return { fwd: DEU_FWD, rev: DEU_REV };
    case 'FRA':
      return { fwd: FRA_FWD, rev: FRA_REV };
    case 'ESP':
      return { fwd: ESP_FWD, rev: ESP_REV };
    case 'ITA':
      return { fwd: ITA_FWD, rev: ITA_REV };
    case 'SWE':
      return { fwd: SWE_FWD, rev: SWE_REV };
    case 'DAN':
      return { fwd: DAN_FWD, rev: DAN_REV };
    case 'NOR':
      return { fwd: NOR_FWD, rev: NOR_REV };
    case 'FIN':
      return { fwd: FIN_FWD, rev: FIN_REV };
    case 'POL':
      return { fwd: POL_FWD, rev: POL_REV };
    case 'BEL':
      return { fwd: BEL_FWD, rev: BEL_REV };
    case 'GRE':
      return { fwd: GRE_FWD, rev: GRE_REV };
    case 'AR':
      return { fwd: AR_FWD, rev: AR_REV };
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
