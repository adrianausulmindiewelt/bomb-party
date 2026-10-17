// Webserver + Multiplayer. Liefert die Seite aus und hält die Räume am Laufen.

import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Room } from './game.js';
import { CardRoom } from './cards/game.js';
import { CHARACTERS, RULES as CARD_RULES } from '../shared/cards.js';
import { GAME, BRAND } from '../shared/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const app = express();
// Die Webseite darf auch von Vercel kommen
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(root + 'public'));
app.use('/shared', express.static(root + 'shared'));

// Bilder der Charakterkarten: liegen in data/card-art/ (nicht im Repo!)
const artDir = root + 'data/card-art/';
mkdirSync(artDir, { recursive: true });
app.use('/card-art', express.static(artDir, { maxAge: 0 }));
app.post('/api/card-art/:key', express.json({ limit: '2mb' }), (req, res) => {
  const { key } = req.params;
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(req.body?.image || '');
  if (!CHARACTERS[key] || !m) return res.status(400).json({ error: 'Ungültig' });
  writeFileSync(artDir + key + '.jpg', Buffer.from(m[1], 'base64'));
  res.json({ ok: true });
});

const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 1_000_000, cors: { origin: '*' } });
const rooms = new Map();

const MAX_AVATAR = 200_000; // ~200 KB als Data-URL reicht für 256×256 JPEG locker

io.on('connection', (socket) => {
  let room = null;

  socket.on('join', (data = {}, ack = () => {}) => {
    if (room) return ack({ error: 'Schon in einem Raum.' });
    const roomId = String(data.room || 'lobby').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'lobby';
    const name = String(data.name || 'Anonym').trim().slice(0, 16) || 'Anonym';
    const color = BRAND.playerColors.includes(data.color) ? data.color : BRAND.playerColors[0];
    const avatar = typeof data.avatar === 'string' && data.avatar.startsWith('data:image/')
      && data.avatar.length < MAX_AVATAR ? data.avatar : null;

    const r = rooms.get(roomId) ?? new Room(roomId);
    const res = r.addPlayer(socket.id, { name, color, avatar });
    if (res.error) return ack(res);
    rooms.set(roomId, r);
    room = r;
    socket.join(roomId);
    ack({ ok: true, id: socket.id, room: roomId });
    io.to(roomId).emit('avatars', room.avatars());
  });

  socket.on('input', (input) => room?.setInput(socket.id, input));

  socket.on('disconnect', () => {
    if (!room) return;
    room.removePlayer(socket.id);
    if (room.players.size === 0) rooms.delete(room.id);
    else io.to(room.id).emit('avatars', room.avatars());
  });
});

// ── Kartenspiel „TOPP DAS!“ (eigener Kanal /karten) ──────────
const cardRooms = new Map();
const BUILD = Date.now().toString(36);   // ändert sich bei jedem Server-Start → alte Seiten laden neu
app.get('/api/karten/tables', (req, res) => {
  res.json([...cardRooms.values()].map((r) => ({
    id: r.id, state: r.state, players: r.players.filter((p) => p.connected).map((p) => p.name), max: CARD_RULES.maxPlayers,
  })));
});
const cards = io.of('/karten');

cards.on('connection', (socket) => {
  socket.emit('hello', { build: BUILD });
  // Fehler in einer Karte/Regel kostet nur diesen einen Zug – nie den ganzen Server mit allen Tischen.
  const on = (event, fn) => socket.on(event, (...args) => {
    try { fn(...args); } catch (err) {
      console.error(`[karten] Fehler bei '${event}' (Tisch ${room?.id ?? '–'}):`, err);
      const ack = args.at(-1);
      if (typeof ack === 'function') ack({ error: 'Da ist was schiefgelaufen – der Zug wurde nicht ausgeführt.' });
    }
  });
  let room = null;
  let pid = null;   // feste Spieler-ID aus dem Browser (überlebt Sperrbildschirm & Funkloch)
  const sync = () => syncRoom(room);
  const act = (fn) => (data, ack = () => {}) => {
    if (!room) return ack({ error: 'Nicht am Tisch.', rejoin: true });   // Browser setzt sich dann selbst wieder hin
    const res = fn(data);
    ack(res);
    if (res.ok) sync();
  };

  on('join', (data = {}, ack = () => {}) => {
    if (room) return ack({ error: 'Schon an einem Tisch.' });
    const roomId = String(data.room || 'tisch').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'tisch';
    const img = (v) => (typeof v === 'string' && v.startsWith('data:image/') && v.length < MAX_AVATAR ? v : null);
    pid = String(data.pid || socket.id).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40) || socket.id;
    const existingRoom = cardRooms.get(roomId);
    const r = existingRoom ?? new CardRoom(roomId);
    const res = r.addPlayer(pid, {
      name: String(data.name || 'Anonym').trim().slice(0, 16) || 'Anonym',
      avatar: img(data.avatar),
      special: { name: data.special?.name, art: img(data.special?.art), effects: data.special?.effects },
    });
    if (res.error) return ack(res);
    if (!existingRoom && data.deckChoice) r.configure(pid, data.deckChoice);
    cardRooms.set(roomId, r);
    room = r;
    r.players.find((p) => p.id === pid).socket = socket.id;
    socket.join(roomId);
    ack({ ok: true, id: pid, room: roomId, rejoined: !!res.rejoined });
    socket.emit('chat-history', r.chat ?? []);
    cards.to(roomId).emit('arts', room.arts());
    sync();
  });

  on('start', act(() => room.start(pid)));
  on('bot-add', act(() => room.addBot(pid)));
  on('bot-remove', act((id) => room.removeBot(pid, id)));
  on('configure', act((choice) => room.configure(pid, choice)));
  on('voice-skip', act(() => room.skipVoice(pid)));
  on('play', act((ids) => room.play(pid, ids)));
  on('take', act(() => room.take(pid)));
  on('chat', (text) => {
    const msg = room?.chatSay(pid, text);
    if (msg) cards.to(room.id).emit('chat', msg);
  });

  on('disconnect', () => {
    if (!room) return;
    const p = room.players.find((o) => o.id === pid);
    if (p?.socket !== socket.id) return;          // schon mit neuer Verbindung zurück
    room.disconnect(pid);
    if (!room.players.length) cardRooms.delete(room.id);
    else { cards.to(room.id).emit('arts', room.arts()); sync(); }
  });
});

function syncRoom(room) {
  if (!room) return;
  for (const p of room.players) if (p.connected && p.socket) cards.to(p.socket).emit('view', room.view(p.id));
}

// Jede Sekunde: Abwesende überspringen/rausnehmen, leere Tische aufräumen
setInterval(() => {
  for (const r of cardRooms.values()) {
    if (r.tick()) syncRoom(r);
    if (!r.players.some((p) => !p.bot && p.connected)) cardRooms.delete(r.id);
  }
}, 1000);

// Spiel-Schleife: alle Räume updaten und den Zustand verschicken
const dt = 1 / GAME.tickRate;
setInterval(() => {
  for (const room of rooms.values()) {
    room.update(dt);
    io.to(room.id).volatile.emit('state', room.snapshot());
  }
}, 1000 * dt);

// Letztes Netz: ein übersehener Fehler (z. B. in einem Timer) wird protokolliert statt alles abzuschießen.
process.on('uncaughtException', (err) => console.error('[server] Unbehandelter Fehler:', err));
process.on('unhandledRejection', (err) => console.error('[server] Unbehandelte Promise-Ablehnung:', err));

const PORT = Number(process.env.PORT) || 3001;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎮 ${BRAND.title} läuft!\n`);
  console.log(`   Auf diesem Rechner:  http://localhost:${PORT}`);
  for (const nets of Object.values(networkInterfaces())) {
    for (const n of nets ?? []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`   Im selben WLAN:      http://${n.address}:${PORT}`);
    }
  }
  console.log('');
});
