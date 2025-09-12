import { MAP_FWD as ITU_FWD, MAP_REV as ITU_REV } from './mapping_itu';
import { MAP_FWD as ENG_FWD, MAP_REV as ENG_REV } from './mapping_eng';
import { MAP_FWD as RUS_FWD, MAP_REV as RUS_REV } from './mapping_ru';
import { MAP_FWD as DEU_FWD, MAP_REV as DEU_REV } from './mapping_de';
import { MAP_FWD as FRA_FWD, MAP_REV as FRA_REV } from './mapping_fr';
import { MAP_FWD as ESP_FWD, MAP_REV as ESP_REV } from './mapping_es';
import { MAP_FWD as ITA_FWD, MAP_REV as ITA_REV } from './mapping_it';
import { MAP_FWD as SWE_FWD, MAP_REV as SWE_REV } from './mapping_swe';
import { MAP_FWD as DAN_FWD, MAP_REV as DAN_REV } from './mapping_dan';
import { MAP_FWD as NOR_FWD, MAP_REV as NOR_REV } from './mapping_nor';
import { MAP_FWD as FIN_FWD, MAP_REV as FIN_REV } from './mapping_fin';
import { MAP_FWD as POL_FWD, MAP_REV as POL_REV } from './mapping_pl';
import { MAP_FWD as BEL_FWD, MAP_REV as BEL_REV } from './mapping_bel';
import { MAP_FWD as GRE_FWD, MAP_REV as GRE_REV } from './mapping_gre';
import { MAP_FWD as AR_FWD, MAP_REV as AR_REV } from './mapping_ar';
import { normalizeMorse, normalizeText } from './normalize';

export type Alphabet = 'ITU' | 'ENG' | 'RUS' | 'DEU' | 'FRA' | 'ESP' | 'ITA' | 'SWE' | 'DAN' | 'NOR' | 'FIN' | 'POL' | 'BEL' | 'GRE' | 'AR';

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
