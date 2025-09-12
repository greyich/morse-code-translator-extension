import { MAP_FWD as ITU_BASE } from './mapping_itu';

export const MAP_FWD: Record<string, string> = {
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

export const MAP_REV: Record<string, string> = Object.fromEntries(
  Object.entries(MAP_FWD).map(([char, code]) => [code, char])
) as Record<string, string>;


