import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MEME_SOUNDS, MemeEvents, MemePlayer } from '../public/karten/meme-sounds.js';

const state = (overrides = {}) => ({ game: 1, state: 'playing', top: 6, ...overrides });
const action = (text, icon = '💣', time = 1) => ({ text, icon, time });

test('Meme-Ereignisse: keine Wiederholung auf Reconnect oder unverändertem View, nur bestätigte Züge', () => {
  const events = new MemeEvents();
  const take = state({ lastAction: action('Host nimmt Stapel (2 Karten)', '😬') });
  assert.equal(events.observe(take, 'host'), null);
  assert.equal(events.observe(take, 'host'), null);
  assert.equal(events.observe({ ...take, lastAction: { ...take.lastAction, time: 2 } }, 'host'), 'bruh');
  assert.equal(events.observe(state({ game: 2 }), 'host'), null);
});

test('Meme-Ereignisse: normale Feuer-/Blitz-Zahlen erzeugen keine dramatischen Spezialkarten-Sounds', () => {
  const events = new MemeEvents(); events.observe(state(), 'me');
  assert.equal(events.observe(state({ top: 9, lastAction: action('Host legt 9 🔥', '🔥', 1) }), 'me'), null);
  assert.equal(events.observe(state({ top: 10, lastAction: action('Host legt 10 ⚡', '⚡', 2) }), 'me'), null);
});

test('Meme-Ereignisse: große Stapel, Kartoffel, 6→7, Spezialkarten und persönlicher Sieg', () => {
  const events = new MemeEvents(); events.observe(state(), 'me');
  assert.equal(events.observe(state({ lastAction: action('Host nimmt Stapel (10 Karten)', '😬', 2) }), 'me'), 'spongebob-fail');
  assert.equal(events.observe(state({ lastAction: action('Host → Kartoffel an Bot', '🥔', 3) }), 'me'), 'fah');
  assert.equal(events.observe(state({ top: 7, lastAction: action('Host legt 7 🔥', '🔥', 4) }), 'me'), 'six-seven');
  assert.equal(events.observe(state({ lastAction: action('Host: Schwarzes Loch', '🕳️', 5) }), 'me'), 'metal-pipe');
  assert.equal(events.observe(state({ lastAction: action('Host: Meine Bombe', '💣', 6) }), 'me'), 'vine-boom');
  assert.equal(events.observe(state({ state: 'over', winner: 'me' }), 'me'), 'yippee');
  assert.equal(events.observe(state({ state: 'over', winner: 'me' }), 'me'), null);
  const loser = new MemeEvents(); loser.observe(state(), 'me');
  assert.equal(loser.observe(state({ state: 'over', winner: 'other' }), 'me'), 'spongebob-fail');
});

function player(enabled = () => true) {
  const starts = [], gains = [];
  const ctx = {
    state: 'running', currentTime: 0,
    createGain: () => ({ gain: { value: 0, setTargetAtTime: (...args) => gains.push(args) }, connect() {} }),
    createBufferSource: () => ({ connect() {}, disconnect() {}, start() { starts.push(this); }, stop() { this.stopped = true; } }),
  };
  const p = new MemePlayer(enabled); p.attach(ctx, {}); p.load = async () => ({ duration: 2 });
  return { p, ctx, starts, gains };
}

test('Meme-Player: Cooldown, nur ein Clip gleichzeitig, Vorschau, Mute und Lautstärke 0', async () => {
  let sfx = true;
  const { p, starts } = player(() => sfx);
  assert.equal(await p.play('bruh'), true);
  assert.equal(await p.play('vine-boom'), false);
  assert.equal(await p.play('vine-boom', { preview: true }), true);
  assert.equal(starts.length, 2);
  assert.equal(p.source, starts[1]);
  p.setEnabled(false); assert.equal(p.source, null);
  assert.equal(await p.play('bruh', { preview: true }), false);
  p.setEnabled(true); sfx = false;
  assert.equal(await p.play('bruh', { preview: true }), false);
  sfx = true; p.setVolume(0);
  assert.equal(await p.play('bruh', { preview: true }), false);
});

test('Meme-Player: verspäteter Download nach Mute spielt nicht; neue Vorschau ersetzt alten Request', async () => {
  const { p, starts } = player();
  let resolve;
  p.load = () => new Promise((done) => { resolve = done; });
  const pending = p.play('bruh');
  p.setEnabled(false); resolve({ duration: 1 });
  assert.equal(await pending, false); assert.equal(starts.length, 0);
  p.setEnabled(true);
  const first = p.play('bruh', { preview: true }); const resolveFirst = resolve;
  const second = p.play('yippee', { preview: true }); const resolveSecond = resolve;
  resolveSecond({ duration: 1 }); assert.equal(await second, true);
  resolveFirst({ duration: 1 }); assert.equal(await first, false);
  assert.equal(starts.length, 1);
});

test('Meme-Player: während Kartenansagen leiser, danach normale Lautstärke; Autoplay-Sperre respektiert', async () => {
  const { p, ctx, gains } = player(); p.setVolume(0.5);
  p.setSpeaking(true); assert.equal(gains.at(-1)[0], 0.06);
  p.setSpeaking(false); assert.equal(gains.at(-1)[0], 0.5);
  ctx.state = 'suspended'; assert.equal(await p.play('bruh'), false);
  p.setVolume(NaN); assert.equal(p.volume, 0.5);
});

test('Meme-Dateien: alle sieben echte kurze MP3s, lokale Pfade und belegte Download-Quellen', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/karten/sounds/memes/manifest.json', import.meta.url)));
  assert.equal(manifest.length, 7);
  for (const sound of MEME_SOUNDS) {
    const meta = manifest.find((s) => s.id === sound.id);
    assert.ok(meta); assert.match(meta.source, /^https:\/\/www.myinstants.com\//);
    assert.ok(meta.duration > 0 && meta.duration <= 3.6);
    const data = await readFile(new URL(`../public${sound.file}`, import.meta.url));
    assert.equal(data.length, meta.bytes);
    assert.ok(data.toString('ascii', 0, 3) === 'ID3' || data[0] === 0xff);
    assert.ok(data.length < 50000);
  }
});
