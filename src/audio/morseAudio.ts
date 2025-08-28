export type MorseSymbol = '.' | '-';
export type SegmentType = 'tone' | 'silence';

export interface Segment {
  type: SegmentType;
  durationMs: number;
}

export interface AudioSchedule {
  start: () => void;
  stop: () => void;
  isPlaying: () => boolean;
}

export interface TimingOptions {
  /** Frequency in Hz for the tone. Default: 600 */
  frequencyHz?: number;
  /** Unit duration in milliseconds. Default: 80 (WPM ~15) */
  unitMs?: number;
  /** Output volume 0..1. Default: 0.2 */
  gain?: number;
  /** Callback called when playback completes */
  onComplete?: () => void;
}

const DEFAULT_UNIT_MS = 100; // 1 dit
const DEFAULT_FREQ = 600;
const DEFAULT_GAIN = 0.2;

/**
 * Convert a morse string into timing segments of tone/silence using ITU timing rules.
 * Assumes input is normalized: letters separated by single space, words by ' / '.
 */
export function morseToSegments(morse: string, opts?: TimingOptions): Segment[] {
  const unitMs = opts?.unitMs ?? DEFAULT_UNIT_MS;
  const segments: Segment[] = [];
  const words = morse.trim().split(' / ');

  const pushTone = (ms: number) => { if (ms > 0) segments.push({ type: 'tone', durationMs: ms }); };
  const pushSilence = (ms: number) => { if (ms > 0) segments.push({ type: 'silence', durationMs: ms }); };

  for (let w = 0; w < words.length; w += 1) {
    const word = words[w];
    if (!word) continue;
    const letters = word.split(' ');
    for (let l = 0; l < letters.length; l += 1) {
      const letter = letters[l];
      for (let i = 0; i < letter.length; i += 1) {
        const ch = letter[i] as MorseSymbol;
        if (ch === '.') {
          pushTone(1 * unitMs);
        } else if (ch === '-') {
          pushTone(3 * unitMs);
        }
        // Intra-character gap (between elements) is 1 unit, except after last element
        if (i !== letter.length - 1) pushSilence(1 * unitMs);
      }
      // Inter-character gap (between letters) is 3 units, except after last letter in word
      if (l !== letters.length - 1) pushSilence(3 * unitMs);
    }
    // Inter-word gap is 7 units, except after last word
    if (w !== words.length - 1) pushSilence(7 * unitMs);
  }
  return segments;
}

export function estimateDurationMs(segments: Segment[]): number {
  let total = 0;
  for (const s of segments) total += s.durationMs;
  return total;
}

/**
 * Schedule playback using Web Audio API in real time.
 * Uses small lookahead scheduling to be robust to timer jitter.
 */
export function scheduleOnline(segments: Segment[], opts?: TimingOptions): AudioSchedule {
  const frequencyHz = opts?.frequencyHz ?? DEFAULT_FREQ;
  const unitGain = opts?.gain ?? DEFAULT_GAIN;
  const onComplete = opts?.onComplete;
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const masterGain = ctx.createGain();
  masterGain.gain.value = unitGain;
  masterGain.connect(ctx.destination);

  let isStopped = true;
  let startTime = 0; // ctx.currentTime when started
  let segIndex = 0;
  const lookaheadMs = 50; // scheduler tick
  const scheduleAheadSec = 0.2; // how far ahead to schedule
  let timerId: number | null = null;

  function scheduleSegment(atSec: number, seg: Segment) {
    if (seg.type === 'tone') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequencyHz;
      osc.connect(gain);
      gain.connect(masterGain);
      const durSec = seg.durationMs / 1000;
      // clickless envelope
      const t0 = atSec;
      const t1 = atSec + durSec;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(1, t0 + 0.004);
      gain.gain.setValueAtTime(1, t1 - 0.004);
      gain.gain.linearRampToValueAtTime(0, t1);
      osc.start(t0);
      osc.stop(t1 + 0.01);
    } else {
      // silence: nothing to schedule, we just advance time
    }
  }

  function schedulerTick() {
    if (isStopped) return;
    const now = ctx.currentTime;
    let curTime = startTime;
    for (let i = 0; i < segIndex; i += 1) curTime += segments[i].durationMs / 1000;
    // schedule until ahead
    while (segIndex < segments.length && curTime < now + scheduleAheadSec) {
      const seg = segments[segIndex];
      scheduleSegment(curTime, seg);
      curTime += seg.durationMs / 1000;
      segIndex += 1;
    }
    if (segIndex >= segments.length) {
      // schedule stop check
      const remainingMs = (curTime - now) * 1000;
      window.setTimeout(() => stop(), Math.max(0, Math.ceil(remainingMs)));
      return;
    }
    timerId = window.setTimeout(schedulerTick, lookaheadMs);
  }

  function start() {
    if (!isStopped) return;
    isStopped = false;
    segIndex = 0;
    startTime = ctx.currentTime + 0.05; // short delay
    schedulerTick();
  }

  function stop() {
    if (isStopped) return;
    isStopped = true;
    if (timerId) {
      window.clearTimeout(timerId);
      timerId = null;
    }
    try { masterGain.disconnect(); } catch {}
    try { ctx.close(); } catch {}
    
    // Call completion callback
    if (onComplete) {
      onComplete();
    }
  }

  return {
    start,
    stop,
    isPlaying: () => !isStopped,
  };
}

export default {
  morseToSegments,
  estimateDurationMs,
  scheduleOnline,
};


