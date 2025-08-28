export const DEFAULT_UNIT_MS = 100;
export const MIN_UNIT_MS = 50;
export const MAX_UNIT_MS = 200;

/**
 * Load unit duration from storage
 */
export async function loadUnitMs(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ unitMs: DEFAULT_UNIT_MS }, (res) => {
      resolve(Math.max(MIN_UNIT_MS, Math.min(MAX_UNIT_MS, res.unitMs)));
    });
  });
}

/**
 * Save unit duration to storage
 */
export async function saveUnitMs(value: number): Promise<void> {
  const clampedValue = Math.max(MIN_UNIT_MS, Math.min(MAX_UNIT_MS, value));
  return new Promise((resolve) => {
    chrome.storage.local.set({ unitMs: clampedValue }, () => resolve());
  });
}

/**
 * Calculate timing values based on unit duration
 */
export function calculateTimings(unitMs: number) {
  return {
    dot: 1 * unitMs,
    dash: 3 * unitMs,
    intraCharGap: 1 * unitMs,
    letterGap: 3 * unitMs,
    wordGap: 7 * unitMs,
    dotThreshold: 1.5 * unitMs,
    dashThreshold: 3.5 * unitMs
  };
}

/**
 * Format timing hint string
 */
export function formatTimingHint(unitMs: number): string {
  const timings = calculateTimings(unitMs);
  return `Dot ${timings.dot} · Dash ${timings.dash} · Letter ${timings.letterGap} · Word ${timings.wordGap}`;
}
