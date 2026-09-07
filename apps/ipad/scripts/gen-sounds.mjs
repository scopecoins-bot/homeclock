/**
 * One-time generator for bundled alarm sounds (44.1kHz 16-bit mono WAV).
 * Run: node scripts/gen-sounds.mjs
 * Output: assets/sounds/{dawn,chime,radial}.wav — committed to Git so the
 * alarm never depends on the network.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const SR = 44100;

function env(i, n, attack = 0.005) {
  const t = i / SR;
  const a = Math.min(1, t / attack);
  const release = Math.pow(0.5, t / (n / SR / 3));
  return a * release;
}

function tone({ freqs, dur, decay }) {
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  freqs.forEach(([f, amp], idx) => {
    for (let i = 0; i < n; i++) {
      out[i] += amp * Math.sin((2 * Math.PI * f * i) / SR) * env(i, n, 0.005) * Math.pow(0.5, i / SR / decay);
    }
  });
  return out;
}

function dawn() {
  // warm rising major third
  const a = tone({ freqs: [[392, 0.5]], dur: 1.2, decay: 0.5 });
  const b = tone({ freqs: [[494, 0.5]], dur: 1.2, decay: 0.5 });
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, Math.floor(SR * 0.5));
  return out;
}

function chime() {
  // bell-ish partials
  return tone({ freqs: [[880, 0.4], [1320, 0.2], [1760, 0.1]], dur: 1.6, decay: 0.35 });
}

function radial() {
  // three quick pulses
  const p = tone({ freqs: [[660, 0.5], [990, 0.15]], dur: 0.35, decay: 0.12 });
  const out = new Float32Array(Math.floor(SR * 1.4));
  for (let k = 0; k < 3; k++) {
    out.set(p, Math.floor(SR * 0.45 * k));
  }
  return out;
}

function toWav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767 * 0.85), 44 + i * 2);
  }
  return buf;
}

const dir = path.resolve(process.argv[2] ?? "assets/sounds");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "dawn.wav"), toWav(dawn()));
writeFileSync(path.join(dir, "chime.wav"), toWav(chime()));
writeFileSync(path.join(dir, "radial.wav"), toWav(radial()));
console.log("sounds written to", dir);
