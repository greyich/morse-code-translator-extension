import { MAP_FWD as ITU_BASE } from './mapping_itu.js';

export const MAP_FWD = {
  ...ITU_BASE,
  'Α': '.-',
  'Β': '-...',
  'Γ': '--.',
  'Δ': '-..',
  'Ε': '.',
  'Ζ': '--..',
  'Η': '....',
  'Θ': '----',
  'Ι': '..',
  'Κ': '-.-',
  'Λ': '.-..',
  'Μ': '--',
  'Ν': '-.',
  'Ξ': '-..-.',
  'Ο': '---',
  'Π': '.--.',
  'Ρ': '.-.',
  'Σ': '...',
  'Τ': '-',
  'Υ': '..-',
  'Φ': '..-.',
  'Χ': '-..-',
  'Ψ': '--.-',
  'Ω': '---'
};

export const MAP_REV = Object.fromEntries(
  Object.entries(MAP_FWD).map(([char, code]) => [code, char])
);


