export function normalizeText(input, alphabet) {
  let s = input.trim();
  if (alphabet === 'AR') {
    s = s.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
    s = s
      .replace(/[\u0622\u0623\u0625]/g, '\u0627')
      .replace(/\u0629/g, '\u0647')
      .replace(/\u0649/g, '\u064A')
      .replace(/\u0624/g, '\u0648')
      .replace(/\u0626/g, '\u064A');
  }
  if (alphabet === 'DEU') {
    s = s.replaceAll('ß', 'ẞ');
  }
  if (!(alphabet === 'AR')) {
    s = s.toUpperCase();
  }
  if (alphabet === 'RUS') {
    s = s.replaceAll('Ё', 'Е');
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function normalizeMorse(input) {
  let s = input
    .replace(/[·•]/g, '.')
    .replace(/[–—]/g, '-')
    .replace(/\t/g, ' ')
    .replace(/\\/g, '/');
  s = s.replace(/[^.\-\/\s]/g, '');
  s = s.replace(/\s*\/\s*/g, ' / ');
  s = s.replace(/ {2,}/g, ' / ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*\/\s*/g, ' / ');
  return s;
}
