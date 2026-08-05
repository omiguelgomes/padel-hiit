// scripts/gen-beep.mjs
// Generates assets/beep.wav — a self-made 880Hz sine beep (CC0). Run: node scripts/gen-beep.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const sampleRate = 44100;
const seconds = 0.12;
const freq = 880;
const n = Math.floor(sampleRate * seconds);
const data = Buffer.alloc(n * 2);
const fade = Math.floor(n * 0.1); // 10% fade in/out
for (let i = 0; i < n; i++) {
  let amp = 0.6;
  if (i < fade) amp *= i / fade;
  else if (i > n - fade) amp *= (n - i) / fade;
  const s = Math.sin((2 * Math.PI * freq * i) / sampleRate) * amp;
  data.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

mkdirSync("assets", { recursive: true });
writeFileSync("assets/beep.wav", Buffer.concat([header, data]));
console.log("Wrote assets/beep.wav", 44 + data.length, "bytes");
