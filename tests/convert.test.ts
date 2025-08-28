import { describe, it, expect } from 'vitest';
import { textToMorse, morseToText, type Alphabet } from '../src/morse/convert';

const opt = (alphabet: Alphabet) => ({ alphabet });

describe('ITU/ENG mappings', () => {
  it('SOS', () => {
    expect(textToMorse('SOS', opt('ITU'))).toBe('... --- ...');
    expect(morseToText('... --- ...', opt('ITU'))).toBe('SOS');
  });

  it('HELLO WORLD', () => {
    const morse = '.... . .-.. .-.. --- / .-- --- .-. .-.. -..';
    expect(textToMorse('HELLO WORLD', opt('ITU'))).toBe(morse);
    expect(morseToText(morse, opt('ITU'))).toBe('HELLO WORLD');
  });

  it('punctuation', () => {
    expect(textToMorse('TEST, OK.', opt('ITU'))).toBe('- . ... - --..-- / --- -.- .-.-.-');
    expect(morseToText('- . ... - --..-- / --- -.- .-.-.-', opt('ITU'))).toBe('TEST, OK.');
  });

  it('digits', () => {
    expect(textToMorse('2025', opt('ITU'))).toBe('..--- ----- ..--- .....');
    expect(morseToText('..--- ----- ..--- .....', opt('ITU'))).toBe('2025');
  });

  it('ENG equals ITU', () => {
    expect(textToMorse('HELLO', opt('ENG'))).toBe(textToMorse('HELLO', opt('ITU')));
  });
});

describe('RUS mappings', () => {
  it('ПРИВЕТ', () => {
    const morse = '.--. .-. .. .-- . -';
    expect(textToMorse('ПРИВЕТ', opt('RUS'))).toBe(morse);
    expect(morseToText(morse, opt('RUS'))).toBe('ПРИВЕТ');
  });

  it('СОС', () => {
    const morse = '... --- ...';
    expect(textToMorse('СОС', opt('RUS'))).toBe(morse);
    expect(morseToText(morse, opt('RUS'))).toBe('СОС');
  });

  it('Ё -> Е, Ъ -> unknown', () => {
    const res = textToMorse('ЁЪ', opt('RUS'));
    expect(res).toBe('. □');
  });
});

describe('Unknown handling', () => {
  it('unknown symbol in text', () => {
    expect(textToMorse('A🙂B', opt('ITU'))).toBe('.- □ -...');
  });

  it('unknown code in morse', () => {
    expect(morseToText('...-.-', opt('ITU'))).toBe('□');
  });

  it('backslash as word separator alias', () => {
    expect(morseToText('.... . .-.. .-.. --- \\ .-- --- .-. .-.. -..', opt('ITU'))).toBe('HELLO WORLD');
  });
});
