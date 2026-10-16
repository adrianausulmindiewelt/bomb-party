// Läuft mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game.js';
import { GAME, TILE } from '../shared/config.js';

const tick = (room, seconds) => { for (let t = 0; t < seconds; t += 1 / 30) room.update(1 / 30); };

test('Spieler*innen starten in verschiedenen Ecken', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  room.addPlayer('b', { name: 'B' });
  const [a, b] = room.players.values();
  assert.notDeepEqual([a.x, a.y], [b.x, b.y]);
});

test('Eigene Bombe trifft, wer stehen bleibt – Runde endet mit Sieg', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  room.addPlayer('b', { name: 'B' });
  room.setInput('a', { x: 0, y: 0, bomb: true });
  tick(room, GAME.bombFuse + 0.2);
  assert.equal(room.players.get('a').alive, false);
  assert.equal(room.state, 'roundOver');
  assert.equal(room.players.get('b').score, 1);
});

test('Explosion zerstört Kisten', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  room.grid[1][3] = TILE.CRATE;
  room.bombs.push({ id: 999, x: 2, y: 1, owner: 'x', range: 2, timer: 0 });
  room.update(1 / 30);
  assert.equal(room.grid[1][3], TILE.EMPTY);
});

test('Wände stoppen die Bewegung', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  room.setInput('a', { x: -1, y: 0 });       // links ist die Außenwand
  tick(room, 1);
  assert.equal(room.players.get('a').x, 1);
});

// ── Mehr Tests für BOMB PARTY ────────────────────────────────
import { rollPowerup } from '../server/game.js';
import { POWERUPS } from '../shared/config.js';

// Alle Kisten weg – dann sind Explosionen und Wege vorhersagbar
const clearCrates = (room) => { for (const row of room.grid) for (let x = 0; x < row.length; x++) if (row[x] === TILE.CRATE) row[x] = TILE.EMPTY; };
const bomb = (x, y, range = 2, timer = 0) => ({ id: -Math.random(), x, y, owner: 'test', range, timer });
const flameAt = (room, x, y) => room.flames.some((f) => f.x === x && f.y === y);

test('Raum ist bei GAME.maxPlayers voll', () => {
  const room = new Room('t');
  for (let i = 0; i < GAME.maxPlayers; i++) assert.equal(room.addPlayer('p' + i, { name: 'P' + i }).ok, true);
  assert.match(room.addPlayer('zu-viel', { name: 'X' }).error, /voll/);
});

test('Ab Person 3 schaut man bis zur nächsten Runde zu', () => {
  const room = new Room('t');
  for (const id of ['a', 'b', 'c']) room.addPlayer(id, { name: id });
  assert.equal(room.players.get('c').alive, false);
  room.startRound();
  assert.ok([...room.players.values()].every((p) => p.alive));
});

test('Spielfeld: Rand und Säulen sind Wände, an allen Startplätzen ist Platz', () => {
  const room = new Room('t');
  for (let i = 0; i < GAME.maxPlayers; i++) room.addPlayer('p' + i, { name: 'P' + i });
  room.startRound();
  const g = room.grid;
  assert.equal(g.length, GAME.rows);
  for (let y = 0; y < GAME.rows; y++) {
    for (let x = 0; x < GAME.cols; x++) {
      const edge = x === 0 || y === 0 || x === GAME.cols - 1 || y === GAME.rows - 1;
      if (edge || (x % 2 === 0 && y % 2 === 0)) assert.equal(g[y][x], TILE.WALL, `(${x}|${y})`);
    }
  }
  const spots = new Set();
  for (const p of room.players.values()) {
    spots.add(`${p.x}|${p.y}`);
    assert.equal(g[p.y][p.x], TILE.EMPTY);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.notEqual(g[p.y + dy][p.x + dx], TILE.CRATE, `neben ${p.name}`);
  }
  assert.equal(spots.size, GAME.maxPlayers);   // niemand startet auf demselben Feld
});

test('Eingaben werden begrenzt, Unsinn wird ignoriert', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  room.setInput('a', { x: 5, y: -9, bomb: 1 });
  assert.deepEqual(room.players.get('a').input, { x: 1, y: -1, bomb: true });
  room.setInput('a', 'quatsch');
  assert.deepEqual(room.players.get('a').input, { x: 1, y: -1, bomb: true });
  room.setInput('a', { x: 'links', y: null });
  assert.deepEqual(room.players.get('a').input, { x: 0, y: 0, bomb: false });
  room.setInput('niemand', { x: 1 });   // darf nicht abstürzen
});

test('Bomben: Limit pro Person und nie zwei auf einem Feld', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  const p = room.players.get('a');
  room.placeBomb(p);
  room.placeBomb(p);
  assert.equal(room.bombs.length, 1);
  p.bombs = 2;
  room.placeBomb(p);
  assert.equal(room.bombs.length, 1);   // gleiches Feld
  p.x = 2;
  room.placeBomb(p);
  assert.equal(room.bombs.length, 2);
  p.x = 3;
  room.placeBomb(p);
  assert.equal(room.bombs.length, 2);   // Limit erreicht
});

test('Von der eigenen Bombe runterlaufen geht – zurück nicht mehr', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  clearCrates(room);
  const p = room.players.get('a');
  room.setInput('a', { x: 0, y: 0, bomb: true });
  room.update(1 / 30);
  assert.equal(room.bombs.length, 1);
  room.setInput('a', { x: 1, y: 0 });
  tick(room, 0.5);
  assert.ok(p.x > 2);
  room.setInput('a', { x: -1, y: 0 });
  tick(room, 0.6);
  assert.equal(p.x, 2);   // bleibt vor der Bombe stehen
});

test('Kettenreaktion: Feuer zündet andere Bomben sofort', () => {
  const room = new Room('t');
  clearCrates(room);
  room.bombs.push(bomb(1, 1, 2, 0), bomb(3, 1, 2, 10));
  room.update(1 / 30);
  assert.equal(room.bombs.length, 0);
  assert.ok(flameAt(room, 5, 1));   // Reichweite der zweiten Bombe
});

test('Feuer stoppt an Wänden und Säulen', () => {
  const room = new Room('t');
  clearCrates(room);
  room.bombs.push(bomb(1, 2, 3));
  room.update(1 / 30);
  assert.ok(flameAt(room, 1, 2) && flameAt(room, 1, 1) && flameAt(room, 1, 5));
  assert.ok(!flameAt(room, 1, 6));   // Reichweite 3
  assert.ok(!flameAt(room, 2, 2));   // Säule
  assert.ok(!flameAt(room, 0, 2) && !flameAt(room, 1, 0));   // Rand
});

test('Kisten stoppen das Feuer und verschwinden', () => {
  const room = new Room('t');
  clearCrates(room);
  room.grid[1][3] = TILE.CRATE;
  room.bombs.push(bomb(1, 1, 5));
  room.update(1 / 30);
  assert.equal(room.grid[1][3], TILE.EMPTY);
  assert.ok(flameAt(room, 3, 1));
  assert.ok(!flameAt(room, 4, 1));
});

test('Power-ups: alte verbrennen im Feuer, frisch gedroppte nicht', () => {
  const room = new Room('t');
  clearCrates(room);
  room.powerups.push({ x: 3, y: 1, type: 'bomb', fresh: false });
  room.bombs.push(bomb(1, 1, 5));
  room.update(1 / 30);
  assert.equal(room.powerups.length, 0);
  assert.ok(!flameAt(room, 4, 1));

  const room2 = new Room('t');
  clearCrates(room2);
  room2.powerups.push({ x: 3, y: 1, type: 'bomb', fresh: true });
  room2.bombs.push(bomb(1, 1, 5));
  room2.update(1 / 30);
  assert.equal(room2.powerups.length, 1);
  assert.equal(room2.powerups[0].fresh, false);
  assert.ok(flameAt(room2, 4, 1));
});

test('Power-ups einsammeln – mit Obergrenzen', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  const p = room.players.get('a');
  room.powerups.push({ x: p.x, y: p.y, type: 'fire', fresh: false });
  room.update(1 / 30);
  assert.equal(p.range, GAME.start.range + 1);
  assert.equal(room.powerups.length, 0);
  for (let i = 0; i < 50; i++) for (const type of Object.keys(POWERUPS)) room.applyPowerup(p, type);
  assert.equal(p.bombs, GAME.max.bombs);
  assert.equal(p.range, GAME.max.range);
  assert.equal(p.speed, GAME.max.speed);
});

test('rollPowerup liefert nur echte Power-ups oder nichts', () => {
  for (let i = 0; i < 200; i++) {
    const type = rollPowerup();
    assert.ok(type === null || POWERUPS[type], String(type));
  }
});

test('Allein in die eigene Bombe: Runde vorbei, aber ohne Sieger', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  room.setInput('a', { x: 0, y: 0, bomb: true });
  tick(room, GAME.bombFuse + 0.2);
  assert.equal(room.state, 'roundOver');
  assert.equal(room.winner, null);
});

test('Nach der Pause startet eine neue Runde – alle leben wieder', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A' });
  room.addPlayer('b', { name: 'B' });
  room.players.get('b').alive = false;
  room.update(1 / 30);
  assert.equal(room.state, 'roundOver');
  assert.equal(room.winner, 'a');
  tick(room, GAME.roundOverTime + 0.1);
  assert.equal(room.state, 'playing');
  assert.equal(room.winner, null);
  assert.ok([...room.players.values()].every((p) => p.alive));
  assert.equal(room.players.get('a').score, 1);   // Punkte bleiben
});

test('Snapshot: kompakt und als JSON verschickbar', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A', color: '#ff3d7f' });
  room.players.get('a').x = 1.23456;
  room.placeBomb(room.players.get('a'));
  const s = JSON.parse(JSON.stringify(room.snapshot()));
  assert.equal(s.grid.length, GAME.cols * GAME.rows);
  assert.equal(s.players[0].x, 1.23);
  assert.equal(s.players[0].name, 'A');
  assert.equal(s.bombs.length, 1);
  assert.equal('input' in s.players[0], false);
});

test('Gehen: Spieler*in verschwindet auch aus Startreihenfolge und Avataren', () => {
  const room = new Room('t');
  room.addPlayer('a', { name: 'A', avatar: 'data:image/png;base64,AA' });
  room.addPlayer('b', { name: 'B' });
  assert.deepEqual(room.avatars(), { a: 'data:image/png;base64,AA', b: null });
  room.removePlayer('a');
  assert.deepEqual(room.order, ['b']);
  assert.deepEqual(room.avatars(), { b: null });
});