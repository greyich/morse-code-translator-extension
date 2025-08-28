export const DEFAULT_UNIT_MS = 100;
export const DEFAULT_FREQ = 600;
export const DEFAULT_GAIN = 0.2;

export function morseToSegments(morse, opts = {}) {
  const unitMs = opts.unitMs ?? DEFAULT_UNIT_MS;
  const segments = [];
  const words = morse.trim().split(' / ');
  const pushTone = (ms) => { if (ms > 0) segments.push({ type: 'tone', durationMs: ms }); };
  const pushSilence = (ms) => { if (ms > 0) segments.push({ type: 'silence', durationMs: ms }); };

  for (let w = 0; w < words.length; w += 1) {
    const word = words[w];
    if (!word) continue;
    const letters = word.split(' ');
    for (let l = 0; l < letters.length; l += 1) {
      const letter = letters[l];
      for (let i = 0; i < letter.length; i += 1) {
        const ch = letter[i];
        if (ch === '.') pushTone(1 * unitMs);
        else if (ch === '-') pushTone(3 * unitMs);
        if (i !== letter.length - 1) pushSilence(1 * unitMs);
      }
      if (l !== letters.length - 1) pushSilence(3 * unitMs);
    }
    if (w !== words.length - 1) pushSilence(7 * unitMs);
  }
  return segments;
}

export function estimateDurationMs(segments) {
  let total = 0;
  for (const s of segments) total += s.durationMs;
  return total;
}

export function scheduleOnline(segments, opts = {}) {
  const frequencyHz = opts.frequencyHz ?? DEFAULT_FREQ;
  const unitGain = opts.gain ?? DEFAULT_GAIN;
  const onComplete = opts.onComplete;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const masterGain = ctx.createGain();
  masterGain.gain.value = unitGain;
  masterGain.connect(ctx.destination);

  let isStopped = true;
  let startTime = 0;
  let segIndex = 0;
  const lookaheadMs = 50;
  const scheduleAheadSec = 0.2;
  let timerId = null;

  function scheduleSegment(atSec, seg) {
    if (seg.type === 'tone') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequencyHz;
      osc.connect(gain);
      gain.connect(masterGain);
      const durSec = seg.durationMs / 1000;
      const t0 = atSec;
      const t1 = atSec + durSec;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(1, t0 + 0.004);
      gain.gain.setValueAtTime(1, t1 - 0.004);
      gain.gain.linearRampToValueAtTime(0, t1);
      osc.start(t0);
      osc.stop(t1 + 0.01);
    }
  }

  function schedulerTick() {
    if (isStopped) return;
    const now = ctx.currentTime;
    let curTime = startTime;
    for (let i = 0; i < segIndex; i += 1) curTime += segments[i].durationMs / 1000;
    while (segIndex < segments.length && curTime < now + scheduleAheadSec) {
      const seg = segments[segIndex];
      scheduleSegment(curTime, seg);
      curTime += seg.durationMs / 1000;
      segIndex += 1;
    }
    if (segIndex >= segments.length) {
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
    startTime = ctx.currentTime + 0.05;
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

  return { start, stop, isPlaying: () => !isStopped };
}

export default { morseToSegments, estimateDurationMs, scheduleOnline };


