export function normalizeText(input, alphabet) {
  let s = input.trim().toUpperCase();
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
