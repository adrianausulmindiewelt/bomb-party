import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardRoom } from '../server/cards/game.js';
import { RULES, PLAYER_CARDS, specialCatalog, ROLES } from '../shared/cards.js';
import { loadDeckPreset, saveDeckPreset } from '../public/karten/deck-preset.js';
import { getBotAvatar, getBotTheme } from '../public/karten/bot-avatar.js';

function lobby() {
  const r = new CardRoom('bots');
  r.addPlayer('host', { name: 'Host', special: { effects: [{ type: 'reset' }] } });
  return r;
}
const num = (id, value, color = RULES.colors[0]) => ({ id, kind: 'number', value, color });
function turn() {
  const r = lobby(); r.addBot('host'); r.start('host'); r.introUntil = 0;
  r.turn = 1;
  for (const p of r.players) { p.role = 'buerger'; p.hand = [num(p.id, 15)]; }
  return r;
}

test('Bots: Host-Verwaltung, Tischlimit, sichtbare Kennzeichnung und keine Übernahme', () => {
  const r = lobby();
  assert.ok(r.addBot('outsider').error);
  for (let i = 1; i < RULES.maxPlayers; i++) assert.equal(r.addBot('host').ok, true);
  assert.ok(r.addBot('host').error);
  const bot = r.players[1];
  assert.equal(r.view('host').players[1].bot, true);
  assert.ok(r.addPlayer(bot.id, { name: 'Fake' }).error);
  assert.ok(r.removeBot('outsider', bot.id).error);
  assert.ok(r.removeBot('host', 'host').error);
  assert.equal(r.removeBot('host', bot.id).ok, true);
  r.start('host');
  assert.ok(r.addBot('host').error);
  assert.ok(r.removeBot('host', r.players[1].id).error);
  r.disconnect('host');
  assert.equal(r.host()?.bot, undefined);
});

test('Bots: Solo-Start, Intro abwarten, Denkpause und menschliche Züge nicht anfassen', () => {
  const r = turn();
  const bot = r.current(); bot.hand = [num(1, 3), num(2, 8)];
  r.introUntil = Date.now() + 10000;
  assert.equal(r.playBot(), false);
  r.introUntil = 0;
  const now = Date.now();
  assert.equal(r.tick(now), false);
  assert.equal(r.tick(now + 1499), false);
  assert.equal(r.tick(now + 1500), true);
  assert.equal(bot.hand.length, 1);
  assert.equal(r.current().id, 'host');
  assert.equal(r.playBot(), false);
});

test('Bots: passende Zahlen zusammen legen und unspielbaren Stapel nehmen', () => {
  const r = turn(); const bot = r.current();
  bot.hand = [num(1, 7), num(2, 7), num(3, 14)];
  r.top = 6; r.pile = [num(4, 6, RULES.colors[1])];
  assert.equal(r.playBot(), true); assert.equal(bot.hand.length, 1);
  r.turn = 1; bot.hand = [num(5, 1)]; r.top = 15; r.pile = [num(6, 15, RULES.colors[1])];
  assert.equal(r.playBot(), true); assert.equal(bot.hand.length, 2);
});

test('Bots: alle Spielerkarten inklusive Ziel- und Farbauswahl spielbar', () => {
  for (const [key, props] of Object.entries(PLAYER_CARDS)) {
    const r = turn();
    const bot = r.current();
    bot.hand = [{ id: 'special', kind: 'special', key, effects: [], ...props }];
    assert.equal(r.playBot(), true, key);
    assert.ok(!bot.hand.some((c) => c.id === 'special'), key);
  }
});

test('Bots: keine autonome Partie ohne verbundenen Menschen', () => {
  const r = turn(); r.players[0].connected = false; r.players[0].awaySince = Date.now();
  assert.equal(r.tick(), false);
  assert.equal(r.tick(Date.now() + 5000), false);
});

test('Preset: dauerhaft laden, ungültige Daten abfangen, alte Karten filtern, Ablehnung erhält letzte Auswahl', () => {
  const storage = { value: null, getItem() { return this.value; }, setItem(k, v) { this.value = v; } };
  assert.equal(loadDeckPreset(storage), null);
  const choice = { voice: false, specials: ['reset', 'gone'], roles: ['held', 'gone'] };
  assert.equal(saveDeckPreset(choice, storage), true);
  const expected = { voice: false, specials: ['reset'], roles: ['held'] };
  assert.deepEqual(loadDeckPreset(storage), expected);
  assert.equal(saveDeckPreset({ roles: [] }, storage), false);
  assert.deepEqual(loadDeckPreset(storage), expected);
  storage.value = '{broken'; assert.equal(loadDeckPreset(storage), null);
  assert.equal(loadDeckPreset({ getItem() { throw Error('blocked'); } }), null);
  assert.equal(saveDeckPreset(expected, { setItem() { throw Error('quota'); } }), false);
});

test('Bots: 100 komplette Partien mit allen wählbaren Karten', () => {
  for (let i = 0; i < 100; i++) {
    const r = lobby(); for (let n = 0; n < 3; n++) r.addBot('host');
    r.configure('host', { specials: specialCatalog().map((c) => c.key), roles: Object.keys(ROLES) });
    r.start('host'); r.introUntil = 0;
    // Nur zur Simulation auch den Host von derselben Strategie steuern lassen.
    r.players[0].bot = true;
    let moves = 0;
    while (r.state === 'playing' && moves++ < 3000) assert.equal(r.playBot(), true, `Partie ${i}, Zug ${moves}`);
    assert.equal(r.state, 'over', `Partie ${i} endet`);
  }
});

test('Bots: Prozedurale Bot-Avatare liefern distinkte Farben und Pinökel-SVGs', () => {
  const t1 = getBotTheme('Bot 1');
  const t2 = getBotTheme('Bot 2');
  const t3 = getBotTheme('Bot 3');
  assert.notEqual(t1.primary, t2.primary);
  assert.notEqual(t2.primary, t3.primary);

  const av1 = getBotAvatar('Bot 1');
  assert.ok(av1.startsWith('data:image/svg+xml;utf8,'));
  const decoded = decodeURIComponent(av1.replace('data:image/svg+xml;utf8,', ''));
  assert.ok(decoded.includes(t1.primary));
  assert.ok(decoded.includes('Pinökel'));
});
