// Tests für die geteilten Dateien (shared/): Effekt-Baukasten, Kartentexte und ob alle Karten, Rollen
// und Einstellungen zusammenpassen. Fängt z. B. eine neue Karte ab, deren Bild oder Fähigkeit fehlt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  RULES, EFFECTS, TARGETS, MAX_EFFECTS_PER_CARD, BASIC_SPECIALS, CHARACTERS, PLAYER_CARDS, ROLES,
  validateEffects, describe as describeEffects, cardText,
} from '../shared/cards.js';
import { GAME, BRAND, TILE, POWERUPS } from '../shared/config.js';

const root = new URL('..', import.meta.url);
const allCards = { ...BASIC_SPECIALS, ...CHARACTERS, ...PLAYER_CARDS };

// ── validateEffects ──────────────────────────────────────────
test('validateEffects: gültige Karte kommt bereinigt zurück', () => {
  assert.deepEqual(validateEffects([{ type: 'draw', n: 2, target: 'all', extra: 'weg damit' }]), [{ type: 'draw', n: 2, target: 'all' }]);
  assert.deepEqual(validateEffects([{ type: 'skip', n: 1.6 }]), [{ type: 'skip', n: 2 }]);
  assert.deepEqual(validateEffects([{ type: 'burn' }, { type: 'again' }]), [{ type: 'burn' }, { type: 'again' }]);
});

test('validateEffects: alles außerhalb der Grenzen wird abgelehnt', () => {
  const bad = {
    'kein Array': 'reset',
    'leer': [],
    'zu viele Effekte': [{ type: 'reset' }, { type: 'burn' }, { type: 'again' }],
    'doppelter Effekt': [{ type: 'reset' }, { type: 'reset' }],
    'unbekannter Effekt': [{ type: 'sofortGewinnen' }],
    'n zu groß': [{ type: 'skip', n: 3 }],
    'n zu klein': [{ type: 'draw', n: 0, target: 'next' }],
    'n keine Zahl': [{ type: 'give', n: 'viele', target: 'next' }],
    'Ziel fehlt': [{ type: 'give', n: 1 }],
    'Ziel nicht erlaubt': [{ type: 'swap', target: 'all' }],
    'Müll im Array': [null],
  };
  for (const [why, list] of Object.entries(bad)) assert.equal(validateEffects(list), null, why);
});

// ── Texte ────────────────────────────────────────────────────
test('describe: Effekte werden zu lesbarem Text', () => {
  assert.equal(describeEffects([{ type: 'draw', n: 2, target: 'all' }]), 'Alle anderen ziehen 2');
  assert.equal(describeEffects([{ type: 'draw', n: 1, target: 'next' }]), 'Die nächste Person zieht 1');
  assert.equal(describeEffects([{ type: 'give', n: 1, target: 'fewest' }]), 'Gib 1 Karte an wer am wenigsten Karten hat');
  assert.equal(describeEffects([{ type: 'skip', n: 1 }]), '1 Person aussetzen');
  assert.equal(describeEffects([{ type: 'skip', n: 2 }]), '2 Personen aussetzen');
  assert.equal(describeEffects([{ type: 'burn' }, { type: 'again' }]), 'Stapel verbrennen + Du bist nochmal dran');
  assert.equal(describeEffects([{ type: 'gibtsnicht' }]), '?');
});

test('cardText: eigener Text gewinnt, sonst aus den Effekten', () => {
  assert.equal(cardText({ text: 'Eigener Text', effects: [{ type: 'reset' }] }), 'Eigener Text');
  assert.equal(cardText({ effects: [{ type: 'reset' }] }), 'Stapel zählt wieder ab 0');
  assert.equal(cardText({}), '');
});

// ── Karten passen zu den Regeln ──────────────────────────────
test('Alle Karten mit Effekten halten sich an den Baukasten', () => {
  for (const [key, c] of Object.entries(allCards)) {
    if (!c.effects?.length) continue;
    assert.ok(c.effects.length <= MAX_EFFECTS_PER_CARD, key);
    assert.deepEqual(validateEffects(c.effects), c.effects, key);
  }
});

test('Jede Karte hat Name, Emoji und einen Text', () => {
  for (const [key, c] of Object.entries(allCards)) {
    assert.ok(c.name, `${key}: name fehlt`);
    assert.ok(c.emoji, `${key}: emoji fehlt`);
    assert.ok(cardText(c).length > 0, `${key}: kein Text`);
  }
});

test('Jede Spielerkarten-Fähigkeit ist im Server eingebaut', () => {
  const server = readFileSync(new URL('server/cards/game.js', root), 'utf8');
  for (const [key, c] of Object.entries(PLAYER_CARDS)) {
    if (c.ability) assert.ok(server.includes(`'${c.ability}'`), `${key}: Fähigkeit '${c.ability}' fehlt in server/cards/game.js`);
    else assert.ok(c.effects?.length, `${key}: braucht ability oder effects`);
  }
});

test('Mitgelieferte Kartenbilder gibt es wirklich', () => {
  for (const [key, c] of Object.entries(allCards)) {
    if (c.art?.startsWith('/karten/')) assert.ok(existsSync(new URL('public' + c.art, root)), `${key}: ${c.art} fehlt`);
  }
});

test('Keine Karten-ID doppelt zwischen Specials, Charakteren und Spielerkarten', () => {
  const keys = [BASIC_SPECIALS, CHARACTERS, PLAYER_CARDS].flatMap((o) => Object.keys(o));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.includes('custom'), false);   // „custom“ ist für selbstgebaute Bomben reserviert
});

test('Rollen-Fähigkeiten im Server prüfen echte Rollen-Schlüssel aus ROLES', () => {
  // Fängt Tippfehler wie role === 'god', wenn die Rolle in ROLES 'gott' heißt – dann greift die Fähigkeit nie
  const server = readFileSync(new URL('server/cards/game.js', root), 'utf8');
  const used = new Set([...server.matchAll(/role === '(\w+)'/g)].map((m) => m[1]));
  assert.ok(used.size > 0);
  for (const key of used) assert.ok(ROLES[key], `server/cards/game.js prüft auf Rolle '${key}' – die gibt es in ROLES nicht`);
});

test('Rollen: sinnvolle Gewichte und nie weniger als 3 Startkarten', () => {
  for (const [key, r] of Object.entries(ROLES)) {
    assert.ok(r.name && r.emoji && r.text, key);
    assert.ok(Number.isInteger(r.cards), key);
    assert.ok(r.weight > 0, key);
    assert.ok(RULES.handSize + r.cards >= 3, key);
  }
});

test('Effekt-Baukasten: Zahlenbereiche und Ziele sind stimmig', () => {
  for (const [key, e] of Object.entries(EFFECTS)) {
    assert.ok(e.label && typeof e.text === 'function', key);
    if (e.n) assert.ok(e.n[0] >= 1 && e.n[0] <= e.n[1], key);
    for (const t of e.targets ?? []) assert.ok(TARGETS[t], `${key}: unbekanntes Ziel ${t}`);
  }
});

test('Kartenregeln: Zahlen und Farben stimmen', () => {
  assert.ok(RULES.minValue >= 1 && RULES.minValue < RULES.maxValue);
  assert.ok(RULES.maxPlayers >= 2);
  assert.equal(new Set(RULES.colors).size, RULES.colors.length);
  for (const c of RULES.colors) assert.match(c, /^#[0-9a-f]{6}$/i);
});

// ── Bomb-Party-Einstellungen ─────────────────────────────────
test('Spielfeld-Einstellungen: ungerade Größe, Startwerte unter den Obergrenzen', () => {
  assert.equal(GAME.cols % 2, 1);
  assert.equal(GAME.rows % 2, 1);
  for (const k of ['bombs', 'range', 'speed']) assert.ok(GAME.start[k] <= GAME.max[k], k);
  assert.ok(GAME.crateDensity >= 0 && GAME.crateDensity <= 1);
  assert.deepEqual(new Set(Object.values(TILE)).size, Object.keys(TILE).length);
  assert.equal(new Set(BRAND.playerColors).size, BRAND.playerColors.length);
  for (const [key, p] of Object.entries(POWERUPS)) assert.ok(p.icon && p.label, key);
});