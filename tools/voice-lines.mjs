// Erzeugt die KI-Ansagen für Spezialkarten als MP3 (Google Gemini TTS).
// Aufruf: GEMINI_API_KEY=… npm run voices
// Erzeugt nur neue oder geänderte Sätze (manifest.json merkt sich den Text).
// Braucht ffmpeg. Den API-Key NIE ins Repo schreiben.

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VOICE_LINES } from '../shared/cards.js';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const VOICE = process.env.TTS_VOICE || 'Puck';
const STYLE = 'Read aloud in German, fast and cheerful like a cheeky game show host explaining a card to teenagers: ';
const dir = fileURLToPath(new URL('../public/karten/voice/', import.meta.url));
const manifestPath = dir + 'manifest.json';

if (!KEY) { console.error('GEMINI_API_KEY fehlt.'); process.exit(1); }
mkdirSync(dir, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const only = process.argv.slice(2);

for (const [key, line] of Object.entries(VOICE_LINES)) {
  if (only.length && !only.includes(key)) continue;
  if (!only.length && manifest[key] === line && existsSync(`${dir}${key}.mp3`)) continue;
  process.stdout.write(`🎙️  ${key} … `);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: STYLE + line }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
      },
    }),
  });
  const data = await res.json();
  const b64 = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!b64) { console.log('FEHLER', JSON.stringify(data).slice(0, 300)); continue; }
  const pcm = `${dir}${key}.pcm`;
  writeFileSync(pcm, Buffer.from(b64, 'base64'));
  // Gemini liefert rohes PCM (16 bit, 24 kHz, mono) → kleines MP3
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcm,
    '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse',
    '-b:a', '64k', `${dir}${key}.mp3`]);
  unlinkSync(pcm);
  manifest[key] = line;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('ok');
}
