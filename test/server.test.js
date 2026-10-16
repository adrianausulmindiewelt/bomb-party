// Server-Tests: startet den echten Spielserver auf einem freien Port und redet per HTTP und Socket.io mit ihm.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { BRAND } from '../shared/config.js';

const PORT = 40000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
let server;
const sockets = [];

before(async () => {
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, PORT: String(PORT) },
  });
  let out = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startet nicht:\n' + out)), 10_000);
    server.stdout.on('data', (d) => { out += d; if (out.includes(`:${PORT}`)) { clearTimeout(timer); resolve(); } });
    server.stderr.on('data', (d) => { out += d; });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server beendet (${code}):\n${out}`)); });
  });
});

after(() => {
  for (const s of sockets) s.close();
  server?.kill();
});

// Verbindet einen Socket – „hello“ wird schon vor dem Verbinden mitgeschnitten
function connect(namespace = '/karten') {
  const s = io(BASE + namespace, { transports: ['websocket'], forceNew: true, reconnection: false });
  sockets.push(s);
  s.hello = new Promise((resolve) => s.once('hello', resolve));
  return new Promise((resolve, reject) => { s.once('connect', () => resolve(s)); s.once('connect_error', reject); });
}
const ask = (s, event, data = null) => new Promise((resolve) => s.emit(event, data, resolve));
// Wartet auf das nächste Event, das die Bedingung erfüllt
const waitFor = (s, event, ok = () => true, ms = 5000) => new Promise((resolve, reject) => {
  const h = (d) => { if (ok(d)) { clearTimeout(timer); s.off(event, h); resolve(d); } };
  const timer = setTimeout(() => { s.off(event, h); reject(new Error(`kein passendes „${event}“`)); }, ms);
  s.on(event, h);
});
const uid = () => Math.random().toString(36).slice(2, 8);

async function sitDown(room, names) {
  const players = [];
  for (const name of names) {
    const s = await connect();
    const res = await ask(s, 'join', { room, name, pid: `${name}-${room}` });
    assert.equal(res.ok, true, res.error);
    players.push(s);
  }
  return players;
}

// ── HTTP ─────────────────────────────────────────────────────
test('HTTP: Seiten, geteilte Dateien, Kartenbilder und der Socket.io-Client werden ausgeliefert', async () => {
  const paths = ['/', '/karten/', '/karten/editor.html', '/shared/cards.js', '/shared/config.js', '/karten/art/ausreden.jpg', '/socket.io/socket.io.js'];
  for (const path of paths) assert.equal((await fetch(BASE + path)).status, 200, path);
  assert.match((await fetch(BASE + '/shared/cards.js')).headers.get('content-type'), /javascript/);
  assert.equal((await fetch(BASE + '/gibts/nicht')).status, 404);
});

test('CORS: die Webseite auf Vercel darf den Server fragen', async () => {
  const pre = await fetch(BASE + '/api/karten/tables', { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
  assert.equal((await fetch(BASE + '/api/karten/tables')).headers.get('access-control-allow-origin'), '*');
});

test('Kartenbild-Upload: nur bekannte Charaktere und nur JPEG', async () => {
  // Ein gültiger Upload würde data/card-art/ überschreiben – darum hier nur die Ablehnungen
  const post = (key, image) => fetch(`${BASE}/api/card-art/${key}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image }),
  });
  assert.equal((await post('gibtsnicht', 'data:image/jpeg;base64,AAAA')).status, 400);
  assert.equal((await post('adrian', 'data:image/png;base64,AAAA')).status, 400);
  assert.equal((await post('adrian', 'kein bild')).status, 400);
});

// ── Kartenspiel über Socket.io ───────────────────────────────
test('Kartentisch: hinsetzen, Tisch-Liste, Host startet, alle bekommen ihre eigene Sicht', async () => {
  const room = 'test-' + uid();
  const [anna, ben] = await sitDown(room, ['Anna', 'Ben']);
  assert.ok((await anna.hello).build);
  const tables = await (await fetch(BASE + '/api/karten/tables')).json();
  assert.deepEqual(tables.find((t) => t.id === room)?.players, ['Anna', 'Ben']);

  const views = [anna, ben].map((s) => waitFor(s, 'view', (v) => v.state === 'playing'));
  assert.match((await ask(ben, 'start')).error, /Host/);
  assert.equal((await ask(anna, 'start')).ok, true);
  const [va, vb] = await Promise.all(views);
  assert.equal(va.players.length, 2);
  assert.ok(va.hand.length >= 3 && vb.hand.length >= 3);
  assert.notDeepEqual(va.hand.map((c) => c.id), vb.hand.map((c) => c.id));
  assert.equal(va.players.some((p) => 'hand' in p), false);   // fremde Karten verlassen den Server nie

  // Während der Los-Animation darf noch niemand legen
  const [who, view] = va.turn === `Anna-${room}` ? [anna, va] : [ben, vb];
  assert.match((await ask(who, 'play', [view.hand[0].id])).error, /warten/);
  // ☝️ „Letzte Karte!“ ohne Anlass: abgelehnt
  assert.match((await ask(who, 'last-card')).error, /nichts/);
});

test('Kartentisch: Chat geht an alle, Neue bekommen den Verlauf', async () => {
  const room = 'chat-' + uid();
  const [anna, ben] = await sitDown(room, ['Anna', 'Ben']);
  const got = waitFor(ben, 'chat');
  anna.emit('chat', '  Hallo   Tisch  ');
  const msg = await got;
  assert.equal(msg.name, 'Anna');
  assert.equal(msg.text, 'Hallo Tisch');

  const cem = await connect();
  const history = waitFor(cem, 'chat-history');
  await ask(cem, 'join', { room, name: 'Cem', pid: 'Cem-' + room });
  assert.deepEqual((await history).map((m) => m.text), ['Hallo Tisch']);
});

test('Kartentisch: wer kurz weg ist, kommt mit derselben pid auf denselben Platz zurück', async () => {
  const room = 'back-' + uid();
  const [anna, ben] = await sitDown(room, ['Anna', 'Ben']);
  const started = waitFor(anna, 'view', (v) => v.state === 'playing');
  assert.equal((await ask(anna, 'start')).ok, true);
  const before = await started;

  const away = waitFor(ben, 'view', (v) => v.players.some((p) => p.name === 'Anna' && !p.connected));
  anna.close();
  await away;

  const again = await connect();
  const back = waitFor(again, 'view');
  const res = await ask(again, 'join', { room, name: 'Anna', pid: `Anna-${room}` });
  assert.equal(res.rejoined, true);
  assert.deepEqual((await back).hand.map((c) => c.id), before.hand.map((c) => c.id));
});

test('Ohne Tisch: Aktionen werden abgelehnt – der Browser soll sich neu hinsetzen', async () => {
  const s = await connect();
  assert.equal((await ask(s, 'play', [1])).rejoin, true);
  assert.equal((await ask(s, 'join', { room: 'solo-' + uid(), name: 'Solo' })).ok, true);
  assert.match((await ask(s, 'join', { room: 'noch-einer' })).error, /Schon/);
});

// ── BOMB PARTY über Socket.io ────────────────────────────────
test('BOMB PARTY: beitreten, Name und Farbe werden gesäubert, Zustand kommt laufend', async () => {
  const s = await connect('/');
  const room = 'bp-' + uid();
  const res = await ask(s, 'join', { room, name: 'X'.repeat(30), color: '#nope' });
  assert.equal(res.ok, true);
  assert.equal(res.room, room);
  const state = await waitFor(s, 'state', (st) => st.players.some((p) => p.id === res.id));
  const me = state.players.find((p) => p.id === res.id);
  assert.equal(me.name.length, 16);
  assert.equal(me.color, BRAND.playerColors[0]);
  assert.match((await ask(s, 'join', { room })).error, /Schon/);
});