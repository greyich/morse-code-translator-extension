import type { Segment } from './morseAudio';

/**
 * Render PCM16 mono WAV from morse segments.
 */
export async function renderWavFromSegments(
  segments: Segment[],
  opts?: { sampleRate?: number; frequencyHz?: number; gain?: number; unitMs?: number }
): Promise<Blob> {
  const sampleRate = opts?.sampleRate ?? 48000;
  const frequencyHz = opts?.frequencyHz ?? 600;
  const gain = opts?.gain ?? 0.2;

  // Compute total samples
  let totalMs = 0;
  for (const s of segments) totalMs += s.durationMs;
  const totalSamples = Math.max(1, Math.round((totalMs / 1000) * sampleRate));

  // Synthesize into Float32 first to apply a small envelope
  const pcm = new Float32Array(totalSamples);

  let cursor = 0; // sample index
  const twoPiF = 2 * Math.PI * frequencyHz;
  const attackSamples = Math.floor(sampleRate * 0.004); // 4ms attack
  const releaseSamples = Math.floor(sampleRate * 0.004); // 4ms release

  for (const seg of segments) {
    const segSamples = Math.max(0, Math.round((seg.durationMs / 1000) * sampleRate));
    if (segSamples === 0) continue;
    if (seg.type === 'tone') {
      for (let i = 0; i < segSamples && cursor < pcm.length; i += 1, cursor += 1) {
        const t = cursor / sampleRate;
        const envAttack = Math.min(1, i / Math.max(1, attackSamples));
        const envRelease = Math.min(1, (segSamples - i) / Math.max(1, releaseSamples));
        const env = Math.min(envAttack, envRelease);
        const sample = Math.sin(twoPiF * t) * gain * env;
        pcm[cursor] = sample;
      }
    } else {
      // silence
      cursor = Math.min(pcm.length, cursor + segSamples);
    }
  }

  // Convert to PCM16
  const pcm16 = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) {
    const x = Math.max(-1, Math.min(1, pcm[i]));
    pcm16[i] = (x < 0 ? x * 0x8000 : x * 0x7fff) | 0;
  }

  // Build WAV header (PCM, mono)
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm16.length * bytesPerSample;
  const fmtChunkSize = 16;
  const riffChunkSize = 4 + (8 + fmtChunkSize) + (8 + dataSize);

  const buffer = new ArrayBuffer(8 + riffChunkSize);
  const view = new DataView(buffer);
  let p = 0;

  function writeStr(s: string) {
    for (let i = 0; i < s.length; i += 1) view.setUint8(p++, s.charCodeAt(i));
  }
  function writeU32(v: number) { view.setUint32(p, v, true); p += 4; }
  function writeU16(v: number) { view.setUint16(p, v, true); p += 2; }

  writeStr('RIFF');
  writeU32(riffChunkSize);
  writeStr('WAVE');
  writeStr('fmt ');
  writeU32(fmtChunkSize);
  writeU16(1); // PCM
  writeU16(numChannels);
  writeU32(sampleRate);
  writeU32(byteRate);
  writeU16(blockAlign);
  writeU16(bytesPerSample * 8);
  writeStr('data');
  writeU32(dataSize);

  // PCM data
  const bytes = new Uint8Array(buffer);
  const dataOffset = p;
  for (let i = 0; i < pcm16.length; i += 1) {
    const v = pcm16[i];
    bytes[dataOffset + i * 2] = v & 0xff;
    bytes[dataOffset + i * 2 + 1] = (v >> 8) & 0xff;
  }

  return new Blob([bytes], { type: 'audio/wav' });
}

export default { renderWavFromSegments };


