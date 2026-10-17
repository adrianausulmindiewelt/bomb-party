// Tests für das Kartenspiel „TOPP DAS!“ – läuft mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardRoom } from '../server/cards/game.js';
import { RULES, ROLES } from '../shared/cards.js';

// Rollen werden zufällig verteilt. Damit Tests nicht je nach Los rot werden
// (z. B. wehrt ein*e Pazifist*in Strafkarten ab), sind alle standardmäßig Bürger*innen.
function table(n = 3, { randomRoles = false } = {}) {
  const r = new CardRoom('t');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, { name: 'P' + i, special: { effects: [{ type: 'reset' }] } });
  assert.equal(r.start('p0').ok, true);
  r.introUntil = 0;   // Intro-Animation im Test überspringen
  if (!randomRoles) for (const p of r.players) p.role = 'buerger';
  return r;
}
const num = (value, color = '#fff') => ({ id: Math.random(), kind: 'number', value, color });

test('Jede*r bekommt zum Start Specials (Standard: 2, Erzmagier: 3) und eine Rolle', () => {
  const r = table(5, { randomRoles: true });
  for (const p of r.players) {
    const expected = (p.role === 'magier' || p.role === 'mage') ? 3 : (RULES.specialsStart || 2);
    assert.equal(p.hand.filter((c) => c.kind === 'special').length, expected);
    assert.equal(p.hand.length, RULES.handSize + ROLES[p.role].cards);
  }
});

test('Rollen sind geheim – nur die eigene ist sichtbar', () => {
  const t = table(3);
  t.players.find((p) => p.id === 'p0').role = 'buerger';
  const v = t.view('p0');
  assert.ok(v.players.find((p) => p.id === 'p0').role);
  assert.equal(v.players.find((p) => p.id === 'p1').role, null);
  assert.equal(v.players.find((p) => p.id === 'p1').secret, true);
});

test('Man muss gleich hoch oder höher legen', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'buerger';
  p.hand = [num(3), num(9), num(9), num(12)];
  r.top = 5;
  assert.match(r.play(p.id, [p.hand[0].id]).error, /≥ 5/);
  assert.equal(r.play(p.id, [p.hand[1].id, p.hand[2].id]).ok, true);   // zwei Neunen zusammen
  assert.equal(r.top, 9);
  assert.notEqual(r.current().id, p.id);                                 // nächste Person dran
});

test('Wer nicht kann, nimmt den Stapel', () => {
  const r = table(2);
  for (const pl of r.players) pl.role = 'buerger';
  const p = r.current();
  p.hand = p.hand.filter((c) => c.ability !== 'phoenix');
  r.pile = [num(10), num(12)];
  r.top = 12;
  const before = p.hand.length;
  assert.equal(r.take(p.id).ok, true);
  assert.equal(p.hand.length, before + 2);
  assert.equal(r.top, 0);
});

test('Spielende: Erste*r ohne Karten gewinnt, Rest nach Kartenzahl', () => {
  const r = table(3);
  const p = r.current();
  p.hand = [num(15)];
  r.top = 0;
  const others = r.players.filter((o) => o !== p);
  others[0].hand = [num(1), num(2), num(3), num(4)];
  others[1].hand = [num(1)];
  r.play(p.id, [p.hand[0].id]);
  assert.equal(r.state, 'over');
  assert.equal(r.winner, p.id);
  assert.deepEqual(r.ranking.map((x) => x.id), [p.id, others[1].id, others[0].id]);
});

test('Nicht dran → kein Zug', () => {
  const r = table(3);
  const notMe = r.players.find((o) => o !== r.current());
  assert.match(r.play(notMe.id, [notMe.hand[0].id]).error, /nicht dran/);
});

test('Verbindung weg und zurück: Platz und Karten bleiben', () => {
  const r = table(3);
  const p = r.players[1];
  const hand = p.hand.map((c) => c.id);
  r.disconnect(p.id);
  assert.equal(r.players.length, 3);
  r.addPlayer(p.id, { name: p.name });
  assert.deepEqual(p.hand.map((c) => c.id), hand);
  assert.equal(p.connected, true);
});

test('Wer weg ist und dran wäre, wird nach Wartezeit übersprungen', () => {
  const r = table(3);
  const p = r.current();
  r.disconnect(p.id);
  assert.equal(r.tick(Date.now() + 1000), false);
  assert.equal(r.tick(Date.now() + (RULES.awaySkipSeconds + 1) * 1000), true);
  assert.notEqual(r.current().id, p.id);
});

test('Während der Intro-Animation darf niemand ziehen', () => {
  const r = table(2);
  r.introUntil = Date.now() + 5000;
  const p = r.current();
  assert.match(r.play(p.id, [p.hand[0].id]).error, /warten/);
});

test('Effekt „Unter“: nächste Person muss niedriger legen', () => {
  const r = table(2);
  const p = r.current();
  p.hand = [{ id: 'u', kind: 'special', key: 'lower', name: 'Unter', emoji: '⬇️', effects: [{ type: 'lower' }] }, num(1)];
  r.top = 8;
  r.play(p.id, ['u']);
  const q = r.current();
  q.hand = [num(12), num(4)];
  assert.ok(r.play(q.id, [q.hand[0].id]).error);
  assert.equal(r.play(q.id, [q.hand[1].id]).ok, true);
});

test('Niemand bekommt die eigene selbst gebaute Karte', () => {
  for (let run = 0; run < 50; run++) {
    const r = table(4);
    for (const p of r.players) assert.notEqual(p.drawn.owner, p.id);
  }
});

// ── Spielerkarten ────────────────────────────────────────────
import { PLAYER_CARDS } from '../shared/cards.js';
const sp = (key) => ({ id: key + Math.random(), kind: 'special', key, effects: [], ...PLAYER_CARDS[key] });
const drawFx = (n, target = 'next') => ({ id: 'd' + Math.random(), kind: 'special', key: 'x', name: 'Zieh', emoji: '📥', effects: [{ type: 'draw', n, target }] });

test('🥔 Kartoffel kann nicht abgelegt, nur weitergereicht werden – Ziel zieht 3', () => {
  const r = table(3);
  for (const o of r.players) { o.hand = [num(1)]; o.role = 'buerger'; }
  const p = r.current();
  const potato = sp('kartoffel');
  p.hand = [potato, num(3), num(4)];
  const t = r.players.find((o) => o !== p);
  const before = t.hand.length;
  assert.ok(r.play(p.id, { ids: [potato.id], choice: {} }).error);           // ohne Ziel geht nicht
  assert.equal(r.play(p.id, { ids: [potato.id], choice: { target: t.id } }).ok, true);
  assert.equal(t.hand.length, before + 3 + 1);
  assert.equal(r.pile.includes(potato), false);
  assert.equal(potato.cameFrom, p.id);
});

test('🥔 Nicht zurück an die Person, von der man sie hat', () => {
  const r = table(3);
  for (const o of r.players) { o.hand = [num(1)]; o.role = 'buerger'; }
  const p = r.current();
  const potato = { ...sp('kartoffel'), cameFrom: r.players.find((o) => o !== p).id };
  p.hand = [potato, num(3)];
  assert.match(r.play(p.id, { ids: [potato.id], choice: { target: potato.cameFrom } }).error, /zurück/);
});

test('🥔 Wer sie hält, zieht dreifach und ist immun gegen Tausch', () => {
  const r = table(2);
  for (const o of r.players) { o.hand = [num(1)]; o.role = 'buerger'; }
  const p = r.current();
  const t = r.players.find((o) => o !== p);
  t.hand = [sp('kartoffel'), num(1)];
  const c = drawFx(2);
  p.hand = [c, num(5), num(6)];
  r.play(p.id, [c.id]);
  assert.equal(t.hand.length, 2 + 6);
  r.turn = r.players.indexOf(p);
  const swap = { id: 's', kind: 'special', key: 'x', name: 'Tausch', emoji: '🃏', effects: [{ type: 'swap', target: 'next' }] };
  p.hand = [swap, num(5)];
  const tHand = t.hand.length;
  r.play(p.id, ['s']);
  assert.equal(t.hand.length, tHand);
});

test('🥔 Letzte Karte = Sieg, alle anderen ziehen 3', () => {
  const r = table(3);
  for (const o of r.players) o.hand = [num(1), num(2)];
  const p = r.current();
  p.hand = [sp('kartoffel'), num(9)];
  r.top = 0;
  const others = r.players.filter((o) => o !== p).map((o) => [o, o.hand.length]);
  r.play(p.id, [p.hand.find((c) => c.kind === 'number').id]);
  assert.equal(r.state, 'over');
  assert.equal(r.winner, p.id);
  for (const [o, n] of others) assert.equal(o.hand.length, n + 3);
});

test('😆 Glücklicher Schelm wirft Ziehen auf den Angreifer zurück', () => {
  const r = table(2);
  for (const o of r.players) o.hand = [num(1)];
  const p = r.current();
  const t = r.players.find((o) => o !== p);
  t.hand = [sp('gluecklich'), num(1)];
  const c = drawFx(3);
  p.hand = [c, num(5)];
  r.play(p.id, [c.id]);
  assert.equal(t.hand.length, 1);         // Schelm verbraucht, nichts gezogen
  assert.equal(p.hand.length, 1 + 3);
});

test('😆 … aber nicht bei Effekten gegen alle', () => {
  const r = table(3);
  for (const o of r.players) o.hand = [num(1)];
  const p = r.current();
  const t = r.players.find((o) => o !== p);
  t.hand = [sp('gluecklich'), num(1)];
  const c = drawFx(2, 'all');
  p.hand = [c, num(5)];
  r.play(p.id, [c.id]);
  assert.equal(t.hand.length, 4);
});

test('♊ Zwillings-Parade kontert Ziehen: Nachbar*innen ziehen je die Hälfte', () => {
  const r = table(4);
  const p = r.current();
  for (const o of r.players) o.hand = [num(1), num(2)];
  const t = r.seatFrom(p, 1);
  t.hand = [sp('zwillinge'), num(1)];
  const c = drawFx(4);
  p.hand = [c, num(5)];
  r.play(p.id, [c.id]);
  assert.equal(t.hand.length, 1);
  assert.equal(p.hand.length, 1 + 2);                          // p sitzt neben t
  assert.equal(r.seatFrom(t, 1).hand.length, 2 + 2);
});

test('♊ Aktiv: zwei Farben passen auf alles, bis man wieder dran ist', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'buerger';
  const tw = sp('zwillinge');
  p.hand = [tw, num(5)];
  r.top = 12;
  const [c1, c2] = RULES.colors;
  assert.equal(r.play(p.id, { ids: [tw.id], choice: { colors: [c1, c2] } }).ok, true);
  const q = r.current();
  q.hand = [{ ...num(2), color: c1 }, num(3)];
  assert.equal(r.play(q.id, [q.hand[0].id]).ok, true);   // 2 auf 12, weil freie Farbe
  assert.equal(r.wild, null);                              // p wieder dran → vorbei
});

test('😢 Trauriger Schelm: Ziel zieht so viele, wie man danach hält', () => {
  const r = table(2);
  for (const o of r.players) o.hand = [num(1)];
  const p = r.current();
  const t = r.players.find((o) => o !== p);
  const sad = sp('traurig');
  p.hand = [sad, num(1), num(2), num(3), num(4)];
  const before = t.hand.length;
  assert.equal(r.play(p.id, { ids: [sad.id], choice: { target: t.id } }).ok, true);
  assert.equal(t.hand.length, before + 4);
});

test('😆😢 Lachen und Weinen: beide Schelme zusammen', () => {
  const r = table(3);
  for (const pl of r.players) pl.role = 'buerger';
  const p = r.current();
  const [a, b] = r.players.filter((o) => o !== p);
  a.hand = [num(1), num(2), num(3)]; b.hand = [num(4)];
  const lucky = sp('gluecklich'), sad = sp('traurig');
  p.hand = [lucky, sad, num(7)];
  const aCount = a.hand.length, bCount = b.hand.length, aIds = a.hand.map((c) => c.id).join();
  assert.equal(r.play(p.id, { ids: [lucky.id, sad.id], choice: { targets: [a.id, b.id] } }).ok, true);
  assert.equal(a.hand.length, aCount);
  assert.notEqual(a.hand.map((c) => c.id).join(), aIds);
  assert.equal(b.hand.length, bCount + 3);
});

test('🎲 Kriege 4 oder verliere 4 – beide Ausgänge', () => {
  const real = Math.random;
  try {
    for (const [roll, delta] of [[0.1, +4 - 1], [0.9, -4 - 1]]) {
      const r = table(2);
      for (const o of r.players) o.hand = [num(1)];
      const p = r.current();
      const g = sp('gluecksspiel');
      p.hand = [g, ...[2, 3, 4, 5, 6, 7].map(num)];
      const before = p.hand.length;
      Math.random = () => roll;
      r.play(p.id, [g.id]);
      Math.random = real;
      assert.equal(p.hand.length, before + delta);
      assert.ok(r.lastFx.text.includes(roll < 0.5 ? 'KRIEGE' : 'VERLIERE'));
    }
  } finally { Math.random = real; }
});

test('🎲 Wer dabei alle Karten verliert, gewinnt', () => {
  const r = table(2);
  for (const o of r.players) o.hand = [num(1)];
  const p = r.current();
  const g = sp('gluecksspiel');
  p.hand = [g, num(2), num(3)];
  const real = Math.random; Math.random = () => 0.9;
  try { r.play(p.id, [g.id]); } finally { Math.random = real; }
  assert.equal(r.state, 'over');
  assert.equal(r.winner, p.id);
});

test('💬 Chat: Text wird gekürzt, Spam gebremst', () => {
  const r = table(2);
  const m = r.chatSay('p0', '  hallo   welt  ' + 'x'.repeat(300));
  assert.equal(m.text.length, 200);
  assert.ok(m.text.startsWith('hallo welt'));
  assert.equal(r.chatSay('p0', 'nochmal'), null);
  assert.equal(r.chatSay('niemand', 'hi'), null);
});
test('🛡️ Aegis der Nullifizierung blockt Ziehen vollständig ab', () => {
  const r = table(3);
  for (const pl of r.players) pl.role = 'buerger';
  const p = r.current();
  const t = r.seatFrom(p, 1);
  t.hand = [sp('aegis'), num(1)];
  const c = drawFx(4);
  p.hand = [c, num(5)];
  r.play(p.id, [c.id]);
  assert.equal(t.hand.length, 1); // Aegis verbraucht, aber 0 Karten gezogen!
  assert.equal(t.hand[0].value, 1);
  assert.equal(r.pile.some((x) => x.ability === 'aegis'), true);
});

test('🛡️ Aegis der Nullifizierung blockt Hand-Tausch ab', () => {
  const r = table(2);
  const p = r.current();
  const t = r.seatFrom(p, 1);
  t.hand = [sp('aegis'), num(2)];
  const swapCard = { ...sp('swap'), effects: [{ type: 'swap', target: 'next' }] };
  p.hand = [swapCard, num(10), num(11)];
  r.play(p.id, [swapCard.id]);
  assert.equal(t.hand.length, 1); // Tausch abgewehrt!
  assert.equal(t.hand[0].value, 2);
});

test('🛡️ Aegis aktiv gespielt: reinigt den Stapel (top = 0)', () => {
  const r = table(2);
  const p = r.current();
  const aegis = sp('aegis');
  p.hand = [aegis, num(5)];
  r.top = 14;
  assert.equal(r.play(p.id, [aegis.id]).ok, true);
  assert.equal(r.top, 0); // Tisch gereinigt
});

test('🪞 Prismatischer Spiegel: wirft Zieh-Strafe auf den Angreifer zurück', () => {
  const r = table(2);
  const p = r.current();
  const t = r.seatFrom(p, 1);
  p.role = 'buerger';
  t.role = 'buerger';
  t.hand = [sp('spiegel'), num(1)];
  const c = drawFx(3);
  p.hand = [c, num(5)];
  r.play(p.id, [c.id]);
  assert.equal(p.hand.length, 1 + 3); // Angreifer muss 3 ziehen!
  assert.equal(t.hand.length, 1 + 3); // Verteidiger zieht auch 3, Spiegel verbraucht
});

test('🕳️ Schwarzes Loch: verbrennt Stapel und lässt alle anderen 1 Handkarte opfern', () => {
  const r = table(3);
  for (const o of r.players) o.role = 'buerger';
  const p = r.current();
  const [a, b] = r.players.filter((o) => o !== p);
  a.hand = [num(2), num(3)];
  b.hand = [num(4), num(5)];
  r.pile = [num(1), num(2), num(3)];
  r.top = 10;
  const hole = sp('schwarzes_loch');
  p.hand = [hole, num(6)];
  assert.equal(r.play(p.id, [hole.id]).ok, true);
  assert.equal(r.pile.length, 0); // Stapel verbrannt
  assert.equal(r.top, 0);
  assert.equal(a.hand.length, 1); // a hat 1 Karte verloren
  assert.equal(b.hand.length, 1); // b hat 1 Karte verloren
});

test('⏳ Chronos-Siegel: Zeitstopp gibt sofortigen Extra-Zug und freie Wahl', () => {
  const r = table(3);
  const p = r.current();
  const chrono = sp('zeitstopp');
  p.hand = [chrono, num(2)];
  r.top = 15;
  assert.equal(r.play(p.id, [chrono.id]).ok, true);
  assert.equal(r.current().id, p.id); // Sofort wieder dran!
  assert.equal(r.top, 0);             // Darf alles legen!
  assert.equal(r.play(p.id, [p.hand[0].id]).ok, true);
});

test('🥷 Meisterdieb: stiehlt verdeckt 1 Handkarte vom Ziel', () => {
  const r = table(2);
  const p = r.current();
  const victim = r.seatFrom(p, 1);
  victim.hand = [num(7), num(8)];
  const thief = sp('dieb');
  p.hand = [thief, num(1)];
  assert.equal(r.play(p.id, { ids: [thief.id], choice: { target: victim.id } }).ok, true);
  assert.equal(victim.hand.length, 1);
  assert.equal(p.hand.length, 2); // 1 eigene + 1 gestohlene
});

test('🤪 Dorfdepp Bauernschläue: nimmt maximal 3 Karten vom Stapel, Rest verbrennt', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'dorfdepp';
  p.hand = [num(1)];
  r.pile = [num(2), num(3), num(4), num(5), num(6), num(7), num(8)]; // 7 Karten
  r.take(p.id);
  assert.equal(p.hand.length, 1 + 3); // nur 3 genommen!
  assert.equal(r.pile.length, 0);
});

test('🪓 Berserker Blutrausch: verbrennt die Hälfte des Stapels', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'berserker';
  p.hand = [num(1)];
  r.pile = [num(2), num(3), num(4), num(5), num(6), num(7)]; // 6 Karten
  r.take(p.id);
  assert.equal(p.hand.length, 1 + 3); // nimmt 3 (Hälfte), Rest verbrennt
});

test('🦸 Held Heldenmut: darf bei ≤ 2 Handkarten jede Zahl legen', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'held';
  p.hand = [num(2), num(3)]; // 2 Handkarten
  r.top = 14;
  assert.equal(r.whyNot([p.hand[0]]), null); // 2 auf 14 erlaubt!
});

test('🕊️ Pazifist: diplomatischer Schutz blockt gezielten Zieh-Angriff bei > 3 Karten', () => {
  const r = table(2);
  const p = r.current();
  const t = r.seatFrom(p, 1);
  t.role = 'pazifist';
  t.hand = [num(1), num(2), num(3), num(4)]; // 4 Handkarten
  const c = drawFx(3);
  p.hand = [c, num(5)];
  r.play(p.id, [c.id]);
  assert.equal(t.hand.length, 4); // Geschützt, keine Zieh-Strafe!
});

test('🧪 Alchemist Transmutation: Paar verbrennt niedrigste Handkarte kostenlos', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'alchemist';
  const c1 = { ...num(7), id: 101 }, c2 = { ...num(7), id: 102 };
  const low = { ...num(2), id: 103 };
  p.hand = [c1, c2, low, num(9)];
  r.top = 0;
  assert.equal(r.play(p.id, [c1.id, c2.id]).ok, true);
  assert.equal(p.hand.some((c) => c.id === low.id), false); // 2 wurde transmutiert!
  assert.equal(p.hand.length, 1);                          // nur noch die 9 übrig
});

test('🕵️‍♂️ Spion: sieht alle geheimen Rollen in view()', () => {
  const r = table(3);
  const p = r.current();
  const [a, b] = r.players.filter((o) => o !== p);
  p.role = 'spion';
  a.role = 'held';
  b.role = 'dorfdepp';
  const v = r.view(p.id);
  const pA = v.players.find((pl) => pl.id === a.id);
  const pB = v.players.find((pl) => pl.id === b.id);
  assert.equal(pA.role.key, 'held');
  assert.equal(pB.role.key, 'dorfdepp');
  assert.equal(pA.secret, false);
});

test('Verbleibende Spezialkarten befinden sich im Nachziehstapel und können gezogen werden', () => {
  const r = table(3);
  const specialsInDeck = r.deck.filter((c) => c.kind === 'special');
  assert.ok(specialsInDeck.length > 0, 'Deck muss Spezialkarten enthalten');
});

test('☀️ Gott: immun gegen Hand-Tausch (swap)', () => {
  const r = table(2);
  const p = r.current();
  const god = r.seatFrom(p, 1);
  god.role = 'god';
  god.hand = [num(1)];
  const swapCard = { id: 201, kind: 'special', key: 'swap', name: 'Tausch', emoji: '🃏', effects: [{ type: 'swap', target: 'next' }] };
  p.hand = [swapCard, num(10), num(11)];
  r.play(p.id, [swapCard.id]);
  assert.equal(god.hand.length, 1); // Hand von Gott bleibt unangetastet!
});

test('☀️ Gott: immun gegen Stapel-Kassieren (takePile)', () => {
  const r = table(2);
  const p = r.current();
  const god = r.seatFrom(p, 1);
  god.role = 'god';
  god.hand = [num(1)];
  r.pile = [num(5), num(6)];
  const tpCard = { id: 202, kind: 'special', key: 'take', name: 'Friss', emoji: '🗑️', effects: [{ type: 'takePile', target: 'next' }] };
  p.hand = [tpCard];
  r.play(p.id, [tpCard.id]);
  assert.equal(god.hand.length, 1); // Gott nimmt den Stapel nicht!
});

test('☀️ Gott: reflektiert gezielte Zieh-Angriffe per göttlichem Karma', () => {
  const r = table(2);
  const p = r.current();
  const god = r.seatFrom(p, 1);
  god.role = 'god';
  god.hand = [num(1)];
  const drawCard = drawFx(2, 'next');
  p.hand = [drawCard, num(4)];
  const beforeP = p.hand.length - 1; // nach Ausspielen
  r.play(p.id, [drawCard.id]);
  assert.equal(god.hand.length, 1); // Gott zieht 0
  assert.equal(p.hand.length, beforeP + 2); // Angreifer wird vom Karma getroffen und zieht 2!
});

test('⚡ Junger Gott: erhält sofort einen Extra-Zug nach Ausspielen einer Spezialkarte', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'demigod';
  const spCard = { id: 301, kind: 'special', key: 'reset', name: 'Reset', emoji: '🔄', effects: [{ type: 'reset' }] };
  p.hand = [spCard, num(5)];
  r.play(p.id, [spCard.id]);
  assert.equal(r.current().id, p.id); // Junger Gott bleibt am Zug!
});

test('🪶 Phönix-Asche: verbrennt den gesamten Tischstapel zu Asche beim Kassieren', () => {
  const r = table(2);
  for (const pl of r.players) pl.role = 'buerger';
  const p = r.current();
  const phoenixCard = sp('phoenix');
  p.hand = [phoenixCard, num(3)];
  r.pile = [num(10), num(11), num(12), num(13)];
  r.top = 13;
  assert.equal(r.take(p.id).ok, true);
  assert.equal(r.pile.length, 0); // Stapel vollständig verbrannt
  assert.equal(p.hand.includes(phoenixCard), false); // Phönix verbraucht (die Ersatzkarte darf zufällig wieder einer sein)
  assert.equal(p.hand.length, 2); // Hat 1 Aschekarte frisch gezogen (num(3) + 1 neue Karte)
});

test('🌌 Dimensionsportal: zieht nächste Spezialkarte direkt aus dem Deck', () => {
  const r = table(2);
  const p = r.current();
  const portalCard = sp('portal');
  p.hand = [portalCard];
  const targetSpecial = { id: 999, kind: 'special', name: 'Geheime Bombe', emoji: '💣' };
  r.deck = [num(1), targetSpecial, num(2)];
  assert.equal(r.play(p.id, [portalCard.id]).ok, true);
  assert.ok(p.hand.some((c) => c.id === 999));
});

test('⚡ Göttlicher Blitz: vernichtet Spezialkarte des Gegners', () => {
  const r = table(2);
  const p = r.current();
  const victim = r.seatFrom(p, 1);
  const enemySpecial = { id: 888, kind: 'special', name: 'Gegner Special' };
  victim.hand = [enemySpecial, num(7)];
  const wrathCard = sp('himmelszorn');
  p.hand = [wrathCard];
  assert.equal(r.play(p.id, { ids: [wrathCard.id], choice: { target: victim.id } }).ok, true);
  assert.equal(victim.hand.some((c) => c.id === 888), false); // Vernichtet!
});

test('🎲 Glücksspieler: darf ungerade Zahl auf gerade Zahl legen', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'gambler';
  r.top = 10; // gerade Zahl
  const odd = num(3); // ungerade Zahl, normalerweise < 10 und verboten
  p.hand = [odd, num(2)];
  assert.equal(r.play(p.id, [odd.id]).ok, true);
  assert.equal(r.top, 3);
});

test('🎵 Farb-Resonanz: Gleiche Farbe auf gleiche Farbe darf um bis zu 2 Punkte unterbieten (8 auf 10)', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'buerger';
  const blueColor = '#3dc6ff';
  // Tischkarte ist blaue 10
  r.pile = [num(10, blueColor)];
  r.top = 10;
  // Handkarte ist blaue 8 (Resonanz erlaubt 10 - 2 = 8)
  const blue8 = num(8, blueColor);
  p.hand = [blue8, num(12, blueColor)];
  assert.equal(r.play(p.id, [blue8.id]).ok, true);
  assert.equal(r.top, 8);
  assert.ok(r.log.some((msg) => msg.includes('Farb-Resonanz')));
});

test('🎵 Farb-Resonanz: Blockiert Unterbieten bei unterschiedlicher Farbe (rote 8 auf blaue 10)', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'buerger';
  const blueColor = '#3dc6ff';
  const redColor = '#ff3d7f';
  r.pile = [num(10, blueColor)];
  r.top = 10;
  const red8 = num(8, redColor);
  p.hand = [red8, num(12, redColor)];
  const res = r.play(p.id, [red8.id]);
  assert.match(res.error, /≥ 10/);
});

test('🎵 Farb-Resonanz: Blockiert auch bei gleicher Farbe, wenn Differenz > 2 (blaue 7 auf blaue 10)', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'buerger';
  const blueColor = '#3dc6ff';
  r.pile = [num(10, blueColor)];
  r.top = 10;
  const blue7 = num(7, blueColor);
  p.hand = [blue7, num(12, blueColor)];
  const res = r.play(p.id, [blue7.id]);
  assert.match(res.error, /≥ 10/);
  assert.match(res.error, /Resonanz-Limit: 8/);
});

test('🎵 Farb-Resonanz bei lower (Unter): Gleiche Farbe darf um bis zu 2 Punkte überbieten (7 auf 5)', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'buerger';
  const greenColor = '#5cff8a';
  r.pile = [num(5, greenColor)];
  r.top = 5;
  r.lower = true;
  const green7 = num(7, greenColor);
  p.hand = [green7, num(3, greenColor)];
  assert.equal(r.play(p.id, [green7.id]).ok, true);
  assert.equal(r.top, 7);
  assert.ok(r.log.some((msg) => msg.includes('Farb-Resonanz')));
});

test('🎵 Farb-Resonanz: Paar derselben Farbe profitiert von Resonanz', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'buerger';
  const yellowColor = '#ffd23d';
  r.pile = [num(12, yellowColor)];
  r.top = 12;
  const yellow10a = num(10, yellowColor);
  const yellow10b = num(10, yellowColor);
  p.hand = [yellow10a, yellow10b, num(15, yellowColor)];
  assert.equal(r.play(p.id, [yellow10a.id, yellow10b.id]).ok, true);
  assert.equal(r.top, 10);
});

test('Keine Farblawine: Drei gleiche Farben verbrennen den Stapel NICHT automatisch', () => {
  const r = table(2);
  const p = r.current();
  p.role = 'buerger';
  const redColor = '#ff3d7f';
  r.pile = [num(5, redColor), num(7, redColor)];
  r.top = 7;
  const red9 = num(9, redColor);
  p.hand = [red9, num(14, redColor)];
  assert.equal(r.play(p.id, [red9.id]).ok, true);
  // Stapel hat jetzt 3 rote Karten und wurde NICHT verbrannt
  assert.equal(r.pile.length, 3);
  assert.equal(r.top, 9);
});

test('⛓️⚡ Farb-Überladung: 3x dieselbe Farbe in Folge zwingt den nächsten Spieler zum Nachziehen', () => {
  const r = table(3);
  const p0 = r.current();
  const p1 = r.seatFrom(p0, 1);
  const p2 = r.seatFrom(p1, 1);
  const blueColor = '#3dc6ff';

  p0.role = 'buerger';
  p1.role = 'buerger';
  p2.role = 'buerger';

  // P0 legt blaue 4
  const c0 = num(4, blueColor);
  p0.hand = [c0, num(15)];
  assert.equal(r.play(p0.id, [c0.id]).ok, true);

  // P1 legt blaue 7
  const c1 = num(7, blueColor);
  p1.hand = [c1, num(15)];
  assert.equal(r.play(p1.id, [c1.id]).ok, true);

  // P2 legt blaue 9 -> 3. blaue Karte in Folge!
  const p0Before = p0.hand.length;
  const c2 = num(9, blueColor);
  p2.hand = [c2, num(15)];
  assert.equal(r.play(p2.id, [c2.id]).ok, true);

  // Der Nächste nach P2 ist P0: P0 muss 1 Strafkarte ziehen!
  assert.equal(p0.hand.length, p0Before + 1);
  assert.ok(r.log.some((msg) => msg.includes('Farb-Überladung')));
  // Stapel ist NICHT verbrannt, Streak zählt als 1x die Farbe (für den nächsten Zweier-Effekt)
  assert.equal(r.pile.length, 3);
  assert.equal(r.top, 9);
  assert.equal(r.colorStreak.count, 1);

  // P0 legt blaue 11 (4. blaue Karte insgesamt, aber 2. Karte im Zyklus -> Zweier-Effekt!)
  const c3 = num(11, blueColor);
  p0.hand = [c3];
  assert.equal(r.play(p0.id, [c3.id]).ok, true);
  assert.equal(r.colorStreak.count, 2);
});

test('⛓️⚡ Farb-Überladung: Gott reflektiert das Ziehen auf den Angreifer', () => {
  const r = table(2);
  const p0 = r.current();
  const p1 = r.seatFrom(p0, 1);
  p1.role = 'god'; // P1 ist Gott!
  const greenColor = '#5cff8a';

  r.colorStreak = { color: greenColor, count: 2 };
  r.pile = [num(2, greenColor), num(4, greenColor)];
  r.top = 4;

  const c = num(6, greenColor);
  p0.hand = [c, num(15)];
  const p0Before = p0.hand.length;
  const p1Before = p1.hand.length;
  assert.equal(r.play(p0.id, [c.id]).ok, true);

  // P1 (Gott) wehrt Ziehen ab, göttliches Karma trifft Angreifer P0!
  assert.equal(p1.hand.length, p1Before);
  assert.equal(p0.hand.length, p0Before - 1 + 1); // Karte gelegt (-1), Strafe reflektiert (+1)
  assert.ok(r.log.some((msg) => msg.includes('Göttliches Karma')));
});

test('⛓️ Kettenfluch: Zwingt gewähltes Ziel, 2 Karten vom Ziehstapel zu ziehen', () => {
  const r = table(2);
  const p0 = r.current();
  const p1 = r.seatFrom(p0, 1);
  p1.role = 'buerger';
  p1.hand = [num(1), num(2), num(3)];
  const curse = sp('kettenfluch');
  p0.hand = [curse, num(5)];
  const before = p1.hand.length;
  assert.equal(r.play(p0.id, { ids: [curse.id], choice: { target: p1.id } }).ok, true);
  assert.equal(p1.hand.length, before + 2);
  assert.ok(r.log.some((msg) => msg.includes('Kettenfluch')));
});

test('⛓️ Kettenfluch: Spiegel spiegelt die Zieh-Strafe auf den Angreifer zurück', () => {
  const r = table(2);
  const p0 = r.current();
  const p1 = r.seatFrom(p0, 1);
  p1.role = 'buerger';
  p1.hand = [sp('spiegel'), num(5)];
  const curse = sp('kettenfluch');
  p0.hand = [curse, num(12)];
  const p0Before = p0.hand.length;

  assert.equal(r.play(p0.id, { ids: [curse.id], choice: { target: p1.id } }).ok, true);
  // P1 zieht 2, aber P0 zieht durch Spiegel ebenfalls 2!
  assert.equal(p0.hand.length, p0Before - 1 + 2);
  assert.ok(r.log.some((msg) => msg.includes('spiegelt den Angriff')));
});

test('Post-Game Reveal: Fun Awards (Kettenkönig, Stapel-Schlucker, Blitzableiter, Pyrotechniker) und Rollen', () => {
  const r = table(3);
  const p0 = r.players[0];
  const p1 = r.players[1];
  const p2 = r.players[2];

  p0.stats = { resonance: 5, pileCards: 1, drawnCards: 0, specials: 2 };
  p1.stats = { resonance: 1, pileCards: 8, drawnCards: 0, specials: 0 };
  p2.stats = { resonance: 0, pileCards: 0, drawnCards: 4, specials: 3 };

  p0.role = 'alchemist';
  p1.role = 'berserker';
  p2.role = 'god';

  p0.hand = [];
  p1.hand = [num(5)];
  p2.hand = [num(7), num(9)];

  r.finish(p0);

  assert.equal(r.state, 'over');
  assert.equal(r.winner, p0.id);
  assert.equal(r.awards.length, 4);

  const king = r.awards.find((a) => a.id === 'resonance');
  assert.ok(king);
  assert.equal(king.title, 'Kettenkönig');
  assert.equal(king.playerName, p0.name);
  assert.equal(king.value, 5);

  const eater = r.awards.find((a) => a.id === 'pileCards');
  assert.ok(eater);
  assert.equal(eater.title, 'Stapel-Schlucker');
  assert.equal(eater.playerName, p1.name);
  assert.equal(eater.value, 8);

  const lightning = r.awards.find((a) => a.id === 'drawnCards');
  assert.ok(lightning);
  assert.equal(lightning.title, 'Blitzableiter');
  assert.equal(lightning.playerName, p2.name);
  assert.equal(lightning.value, 4);

  const pyro = r.awards.find((a) => a.id === 'specials');
  assert.ok(pyro);
  assert.equal(pyro.title, 'Pyrotechniker');
  assert.equal(pyro.playerName, p2.name);
  assert.equal(pyro.value, 3);

  const v = r.view(p1.id);
  assert.equal(v.awards.length, 4);
  assert.equal(v.ranking[0].id, p0.id);
  assert.equal(v.ranking[0].role.key, 'alchemist');
  assert.equal(v.ranking[1].id, p1.id);
  assert.equal(v.ranking[1].role.key, 'berserker');
  assert.equal(v.ranking[2].id, p2.id);
  assert.equal(v.ranking[2].role.key, 'god');
});

test('🍕 Pizza-Raid (Club-Karte): Reinigt Tisch und lässt Spieler*innen mit > 3 Karten 1 Karte abwerfen', () => {
  const r = table(3);
  const p0 = r.current();
  const others = r.players.filter((p) => p !== p0);
  others[0].hand = [num(1), num(2), num(3), num(4), num(5)];
  others[1].hand = [num(1), num(2)];
  const pizza = sp('pizza_hunger');
  p0.hand = [pizza, num(5)];
  r.top = 10;

  assert.equal(r.play(p0.id, [pizza.id]).ok, true);
  assert.equal(r.top, 0);
  assert.equal(others[0].hand.length, 4); // 1 abgeworfen
  assert.equal(others[1].hand.length, 2); // Unberührt
  assert.ok(r.log.some((msg) => msg.includes('Pizza-Raid')));
});

test('🧘‍♀️ Džanas Zen-Gong (Club-Karte): Wirft bis zu 2 Handkarten des Ziels ab und setzt Tisch auf Boss (15)', () => {
  const r = table(2);
  const p0 = r.current();
  const p1 = r.seatFrom(p0, 1);
  p1.hand = [num(3), num(4), num(5)];
  const zen = sp('dzana_zen');
  p0.hand = [zen, num(8)];

  assert.equal(r.play(p0.id, { ids: [zen.id], choice: { target: p1.id } }).ok, true);
  assert.equal(p1.hand.length, 1);
  assert.equal(r.top, 15);
  assert.ok(r.log.some((msg) => msg.includes('Zen-Gong')));
});

test('🧚‍♀️ Feen-Streich (Club-Karte): Stiehlt Spezialkarte aus Hand des Ziels', () => {
  const r = table(2);
  const p0 = r.current();
  const p1 = r.seatFrom(p0, 1);
  const targetSpecial = sp('kartoffel');
  p1.hand = [targetSpecial, num(7)];
  const fairy = sp('fee_trick');
  p0.hand = [fairy, num(9)];

  assert.equal(r.play(p0.id, { ids: [fairy.id], choice: { target: p1.id } }).ok, true);
  assert.ok(p0.hand.some((c) => c.ability === 'potato'));
  assert.equal(p1.hand.length, 1);
  assert.ok(r.log.some((msg) => msg.includes('Feen-Streich')));
});

test('🏛️ Sanctuary-Protokoll (André - Gruppenleiter): Reinigt Tisch und lässt Person mit den meisten Karten 2 abwerfen', () => {
  const r = table(3);
  const p0 = r.current();
  const others = r.players.filter((p) => p !== p0);
  others[0].hand = [num(1), num(2), num(3), num(4), num(5)];
  others[1].hand = [num(1), num(2)];
  const sanc = sp('andre_mentor');
  p0.hand = [sanc, num(8)];
  r.top = 12;

  assert.equal(r.play(p0.id, [sanc.id]).ok, true);
  assert.equal(r.top, 0);
  assert.equal(others[0].hand.length, 3); // 2 abgeworfen
  assert.equal(others[1].hand.length, 2); // Unberührt
  assert.ok(r.log.some((msg) => msg.includes('Sanctuary-Protokoll')));
});

test('📋 Die Musterlösung (Adrian - Chef-Dekret): Reinigt Tisch, gibt Extra-Zug und bestraft Spieler*innen mit > 3 Handkarten', () => {
  const r = table(3);
  const p0 = r.current();
  const others = r.players.filter((p) => p !== p0);
  others[0].hand = [num(1), num(2), num(3), num(4)]; // > 3 Karten -> zieht 1 -> 5
  others[1].hand = [num(1), num(2)];                  // <= 3 Karten -> bleibt bei 2
  const sol = sp('adrian_muster');
  p0.hand = [sol, num(8)];
  r.top = 10;

  assert.equal(r.play(p0.id, [sol.id]).ok, true);
  assert.equal(r.top, 0);
  assert.equal(r.current().id, p0.id); // Extra-Zug (again)
  assert.equal(others[0].hand.length, 5); // 1 Strafkarte gezogen
  assert.equal(others[1].hand.length, 2); // Unberührt
  assert.ok(r.log.some((msg) => msg.includes('Musterlösung')));
});

test('🍪 Der Cookie-Crunch (Cookie - Amelie): Invertiert Richtung, rotiert Handkarten und setzt chaotischen Tischwert', () => {
  const r = table(3);
  const p0 = r.current();
  const others = r.players.filter((p) => p !== p0);
  const initialDir = r.dir;
  const cookie = sp('cookie_chaos');
  p0.hand = [cookie, num(5)];
  others[0].hand = [num(2)];
  others[1].hand = [num(9)];

  assert.equal(r.play(p0.id, [cookie.id]).ok, true);
  assert.equal(r.dir, -initialDir);
  assert.ok(r.top >= 1 && r.top <= 15);
  assert.ok(r.log.some((msg) => msg.includes('Cookie-Crunch')));
});

test('🎨 Scribbl-Meisterwerk (Teya - 12): Hebt Farbregeln auf & Gankoomon-Schutz fängt Ziehstrafe ab', () => {
  const r = table(3);
  const p0 = r.current();
  const others = r.players.filter((p) => p !== p0);
  const teya = sp('teya_scribbl');
  p0.hand = [teya, num(3)];
  r.top = 10;

  assert.equal(r.play(p0.id, [teya.id]).ok, true);
  assert.equal(r.top, 0);
  assert.ok(r.wild); // Alle Farben erlaubt

  // Passiv: Ziel hält Teya-Karte, Angreifer zwingt zum Ziehen
  const target = others[0];
  const bigHandPlayer = others[1];
  target.hand = [sp('teya_scribbl')];
  bigHandPlayer.hand = [num(1), num(2), num(3), num(4)];

  r.draw(target, 2, { from: p0 });
  assert.equal(target.hand.length, 1); // Wurde beschützt!
  assert.equal(bigHandPlayer.hand.length, 6); // Hat die 2 Karten abgefangen!
  assert.ok(r.log.some((msg) => msg.includes('Gankoomon-Schutz')));
});

test('👀 Stille Beobachterin (Ayleen - 13): Senkt Tischwert um 5 und legt heimlich Karte ab', () => {
  const r = table(3);
  const p0 = r.current();
  const ayleen = sp('ayleen_observer');
  p0.hand = [ayleen, num(7), num(2)];
  r.top = 12;

  assert.equal(r.play(p0.id, [ayleen.id]).ok, true);
  assert.equal(r.top, 7); // 12 - 5
  assert.equal(p0.hand.length, 1); // 1 Karte zusätzlich heimlich abgelegt
  assert.ok(r.log.some((msg) => msg.includes('Stille Beobachterin')));
});

test('🏎️ Turbo-Abreise (Niclas): Überspringt 2 Personen und zwingt sie zum Ziehen', () => {
  const r = table(3);
  for (const o of r.players) o.role = 'buerger';
  const p0 = r.current();
  const others = r.players.filter((p) => p !== p0);
  others[0].hand = [num(1)];
  others[1].hand = [num(2)];
  const turbo = sp('niclas_turbo');
  p0.hand = [turbo, num(5)];

  assert.equal(r.play(p0.id, [turbo.id]).ok, true);
  assert.equal(others[0].hand.length, 2); // 1 Strafkarte
  assert.equal(others[1].hand.length, 2); // 1 Strafkarte
  assert.ok(r.log.some((msg) => msg.includes('Turbo-Abreise')));
});

test('🎆 Pyrotechnischer Knall (Ruben): Verbrennt Tischstapel und alle höchsten Zahlenkarten', () => {
  const r = table(3);
  for (const o of r.players) o.role = 'buerger';
  const p0 = r.current();
  const others = r.players.filter((p) => p !== p0);
  p0.hand = [sp('ruben_firework'), num(3), num(11)];
  others[0].hand = [num(2), num(14)];
  others[1].hand = [num(8)];
  r.top = 9;
  r.pile = [num(4), num(9)];

  assert.equal(r.play(p0.id, [p0.hand[0].id]).ok, true);
  assert.equal(r.top, 0);
  assert.equal(r.pile.length, 0);
  assert.ok(!p0.hand.some((c) => c.value === 11)); // 11 verbrannt
  assert.ok(!others[0].hand.some((c) => c.value === 14)); // 14 verbrannt
  assert.ok(!others[1].hand.some((c) => c.value === 8)); // 8 verbrannt
  assert.ok(r.log.some((msg) => msg.includes('Pyrotechnischer Knall')));
});

test('✨ Chain-Banner (Feature 1): chainEvent wird in view() übertragen und id inkrementiert', () => {
  const r = table(2);
  const p0 = r.current();
  const aegis = sp('aegis');
  p0.hand = [aegis, num(7)];
  r.play(p0.id, [aegis.id]);

  const v = r.view(p0.id);
  assert.ok(v.chainEvent, 'chainEvent existiert in view');
  assert.equal(v.chainEvent.id, 1);
  assert.equal(v.chainEvent.actor, p0.name);
  assert.equal(v.chainEvent.title, 'Aegis der Nullifizierung');

  // Zweiter Trigger inkrementiert id
  const p1 = r.current();
  p1.hand = [num(10, '#3dc6ff')];
  r.top = 10;
  r.pile = [num(10, '#3dc6ff')];
  // Farb-Resonanz
  const resCard = num(8, '#3dc6ff');
  p1.hand = [resCard];
  r.play(p1.id, [resCard.id]);

  const v2 = r.view(p1.id);
  assert.equal(v2.chainEvent.id, 2);
  assert.equal(v2.chainEvent.title, 'Farb-Resonanz!');
});

test('🃏 Letzter Zug Indikator (Feature 3): lastAction wird bei Legen und Stapelnehmen aktualisiert', () => {
  const r = table(2);
  const p0 = r.current();
  p0.hand = [num(9, '#ff3d7f'), num(12, '#ff3d7f')];
  for (const pl of r.players) if (pl !== p0) pl.hand = [num(2), num(3)]; // keine Zufalls-Specials, die beim Stapelnehmen eingreifen
  r.top = 5;
  r.play(p0.id, [p0.hand[0].id]);

  let v = r.view(p0.id);
  assert.ok(v.lastAction, 'lastAction ist gesetzt');
  assert.ok(v.lastAction.text.includes(`${p0.name} legt 9`));

  // Nächste Person nimmt den Stapel
  const p1 = r.current();
  const res = r.take(p1.id);
  assert.equal(res.ok, true);
  v = r.view(p1.id);
  assert.ok(v.lastAction.text.includes('nimmt Stapel'));
});

test('💣 Optionale Bomben-Karten: Ohne selbstgebaute Karte spielt man nur mit offiziellen/Club-Karten', () => {
  const r = new CardRoom('optional-room');
  r.addPlayer('alice', { name: 'Alice', special: null });
  r.addPlayer('bob', { name: 'Bob', special: null });
  assert.equal(r.start('alice').ok, true);

  for (const p of r.players) {
    const specials = p.hand.filter((c) => c.kind === 'special');
    assert.ok(specials.length >= 2, 'Spieler hat mindestens 2 Specials erhalten');
  assert.ok(!specials.some((c) => c.key === 'custom'), 'Keine selbstgebaute Bombe im Spiel');
  }
});

test('👑 hasRole(): erkennt zuverlässig deutsche Keys und englische abilities für alle Rollen', () => {
  const r = new CardRoom('test-roles');
  const p = { role: 'magier' };
  assert.equal(r.hasRole(p, 'magier'), true);
  assert.equal(r.hasRole(p, 'mage'), true);

  p.role = 'gott';
  assert.equal(r.hasRole(p, 'gott'), true);
  assert.equal(r.hasRole(p, 'god'), true);

  p.role = 'junggott';
  assert.equal(r.hasRole(p, 'junggott'), true);
  assert.equal(r.hasRole(p, 'demigod'), true);

  p.role = 'gluecksspieler';
  assert.equal(r.hasRole(p, 'gluecksspieler'), true);
  assert.equal(r.hasRole(p, 'gambler'), true);

  p.role = 'nekromant';
  assert.equal(r.hasRole(p, 'nekromant'), true);
  assert.equal(r.hasRole(p, 'necromancer'), true);
});

test('💀 Nekromant (Option A): erntet Seelen und opfert 1 Handkarte kostenlos, wenn verbrannt wird', () => {
  const r = table(2);
  const p0 = r.current();
  const necro = r.seatFrom(p0, 1);
  p0.role = 'buerger';
  necro.role = 'nekromant';
  necro.hand = [num(3), num(12), num(7)];
  r.triggerNecromancer();
  assert.equal(necro.hand.length, 2);
  // Höchste Zahlenkarte (12) wurde geopfert
  assert.equal(necro.hand.some((c) => c.value === 12), false);
  assert.deepEqual(necro.hand.map((c) => c.value), [3, 7]);
  assert.equal(r.chainEvent?.title, 'Seelen-Opfer!');
});

test('🦸 Held*in: Darf bei ≤ 2 Handkarten jede beliebige Zahl auf jede Zahl legen', () => {
  const r = table(2);
  const p0 = r.current();
  p0.role = 'held';
  p0.hand = [num(2), num(4)];
  r.top = 14;
  r.lower = false;
  // 2 auf 14 ist normalerweise verboten, aber Held hat nur 2 Karten
  assert.equal(r.whyNot([p0.hand[0]]), null);
  assert.equal(r.play(p0.id, [p0.hand[0].id]).ok, true);
});

test('🎲 Glücksspieler: Darf ungerade auf gerade (und umgekehrt) legen', () => {
  const r = table(2);
  const p0 = r.current();
  p0.role = 'gluecksspieler';
  p0.hand = [num(3), num(8)];
  r.top = 10; // gerade
  r.lower = false;
  // 3 auf 10 ist niedriger, aber ungerade auf gerade -> erlaubt!
  assert.equal(r.whyNot([p0.hand[0]]), null);

  r.top = 7; // ungerade
  // 8 auf 7 ist gerade auf ungerade -> erlaubt!
  assert.equal(r.whyNot([p0.hand[1]]), null);
});

test('🧪 Alchemist: Wirft bei einem Paar automatisch die niedrigste Karte ab', () => {
  const r = table(2);
  const p0 = r.current();
  p0.role = 'alchemist';
  p0.hand = [num(2), num(8), num(8), num(11)];
  r.top = 5;
  const res = r.play(p0.id, [p0.hand[1].id, p0.hand[2].id]);
  assert.equal(res.ok, true);
  // 8 & 8 gelegt, 2 (niedrigste) wurde kostenlos transmutiert
  assert.equal(p0.hand.length, 1);
  assert.equal(p0.hand[0].value, 11);
  assert.equal(r.pile.some((c) => c.value === 2), true);
});

test('🕵️‍♂️ Spion: Sieht die Rollen aller Mitspieler*innen im view()', () => {
  const r = table(3);
  const spy = r.players[0];
  const p1 = r.players[1];
  const p2 = r.players[2];
  spy.role = 'spion';
  p1.role = 'dorfdepp';
  p2.role = 'held';

  const v = r.view(spy.id);
  assert.equal(v.players.find((p) => p.id === p1.id).role?.key, 'dorfdepp');
  assert.equal(v.players.find((p) => p.id === p2.id).role?.key, 'held');
});

test('🕊️ Pazifist: Wehrt gezielte Zieh- und Tauschangriffe ab, wenn Hand > 3', () => {
  const r = table(2);
  const attacker = r.current();
  const paci = r.seatFrom(attacker, 1);
  paci.role = 'pazifist';
  paci.hand = [num(1), num(2), num(3), num(4)]; // 4 Karten (> 3)

  // Gezielter Zieh-Angriff
  r.draw(paci, 2, { from: attacker });
  assert.equal(paci.hand.length, 4); // Kein Zuwachs!

  // Gezielter Tausch-Angriff (swap)
  attacker.hand = [num(10)];
  r.runEffect(attacker, { type: 'swap', target: 'next' }, { skip: 0, again: false });
  assert.equal(paci.hand.length, 4); // Keine getauschte Hand!
  assert.equal(attacker.hand.length, 1);
});

test('🪓 Berserker & 🤪 Dorfdepp: halbieren bzw. cappen den Stapel auf 3', () => {
  const r = table(3);
  const dorf = r.players[0];
  const berserk = r.players[1];
  dorf.role = 'dorfdepp';
  berserk.role = 'berserker';
  dorf.hand = [num(99)];
  berserk.hand = [num(99)];

  // 10 Karten auf dem Stapel
  r.turn = 0;
  r.pile = [num(1), num(2), num(3), num(4), num(5), num(6), num(7), num(8), num(9), num(10)];
  const res1 = r.take(dorf.id);
  assert.equal(res1.ok, true);
  assert.equal(dorf.hand.length, 4); // 1 vorher + max 3 = 4

  r.turn = 1;
  r.pile = [num(1), num(2), num(3), num(4), num(5), num(6), num(7), num(8), num(9), num(10)];
  const res2 = r.take(berserk.id);
  assert.equal(res2.ok, true);
  assert.equal(berserk.hand.length, 6); // 1 vorher + 5 (Hälfte) = 6
});

test('🐦‍⬛ Pechvogel: Angreifer zieht 1 Karte mit', () => {
  const r = table(2);
  const attacker = r.current();
  const pech = r.seatFrom(attacker, 1);
  pech.role = 'pechvogel';
  attacker.hand = [num(1)];
  pech.hand = [num(2)];
  r.deck = [num(5), num(6), num(7)];

  r.draw(pech, 1, { from: attacker });
  assert.equal(pech.hand.length, 2);
  assert.equal(attacker.hand.length, 2); // 1 mitgezogen!
});

test('⚡ Junger Gott: Erhält Extra-Zug nach dem Ausspielen einer Spezialkarte', () => {
  const r = table(2);
  const p0 = r.current();
  p0.role = 'junggott';
  p0.hand = [{ id: 999, kind: 'special', key: 'reset', effects: [{ type: 'reset' }] }];
  const res = r.play(p0.id, [999]);
  assert.equal(res.ok, true);
  // Weiterhin p0 dran (Extra-Zug)
  assert.equal(r.current().id, p0.id);
});

test('🎨 view.customCards: Eigene Bomben von Spieler*innen werden für den Almanach übertragen', () => {
  const r = new CardRoom('custom-almanach');
  r.addPlayer('alice', { name: 'Alice', special: { name: 'Sternen-Detonation', effects: [{ type: 'burn' }] } });
  r.addPlayer('bob', { name: 'Bob', special: null });
  assert.equal(r.start('alice').ok, true);

  const v = r.view('bob');
  assert.ok(Array.isArray(v.customCards), 'customCards ist Array');
  assert.equal(v.customCards.length, 1);
  assert.equal(v.customCards[0].name, 'Sternen-Detonation');
  assert.equal(v.customCards[0].by, 'Alice');
  assert.ok(v.customCards[0].text.includes('verbrennen'));
});

test('☀️ Gott: Prallt Angriffe ab, wehrt Tausch ab und reflektiert Ziehen', () => {
  const r = table(2);
  const attacker = r.current();
  const god = r.seatFrom(attacker, 1);
  god.role = 'gott';
  god.hand = [num(5)];
  attacker.hand = [num(1)];
  r.deck = [num(10), num(11)];

  // Gezielter Ziehangriff trifft Angreifer karmisch
  r.draw(god, 1, { from: attacker });
  assert.equal(god.hand.length, 1);
  assert.equal(attacker.hand.length, 2);

  // Tausch prallt ab
  r.runEffect(attacker, { type: 'swap', target: 'next' }, { skip: 0, again: false });
  assert.equal(god.hand.length, 1);
});











test('Ohne eigene Bomben-Karte stürzt arts() nicht ab (hat am 15.10. den Server gekillt)', () => {
  const r = new CardRoom('no-special');
  r.addPlayer('a', { name: 'A', special: null });
  r.addPlayer('b', { name: 'B', special: { effects: [{ type: 'reset' }] } });
  const arts = r.arts();
  assert.equal(arts.a.art, null);
  assert.ok('b' in arts);
});

test('🛡️ Aegis der Nullifizierung: Annulliert Aussetzen (skip) und schützt den eigenen Zug', () => {
  const r = table(3);
  const p0 = r.players[0];
  const p1 = r.players[1];

  const aegisCard = sp('aegis');
  p1.hand = [aegisCard, num(10)];
  r.turn = 0; // p0 ist dran

  const skipCard = { id: 'skip1', kind: 'special', key: 'skip', name: 'Stopp', effects: [{ type: 'skip', n: 1 }] };
  p0.hand = [skipCard, num(5)];
  assert.equal(r.play(p0.id, [skipCard.id]).ok, true);

  // Aegis hat Aussetzen geblockt, p1 setzt nicht aus, sondern ist regulär dran!
  assert.equal(r.current().id, p1.id);
  assert.ok(!p1.hand.includes(aegisCard), 'Aegis wurde abgeworfen');
  assert.ok(r.pile.includes(aegisCard), 'Aegis liegt auf dem Ablagestapel');
  assert.ok(r.log.some((msg) => msg.includes('annulliert das Aussetzen mit der Aegis')));
});

test('🚚 Bernd (takePile): Wendet Phönix-Asche, Dorfdepp und Berserker zuverlässig an', () => {
  const r2 = table(2);
  const berndPlayer = r2.players[0];
  const victimDorf = r2.players[1];
  victimDorf.role = 'dorfdepp';
  victimDorf.hand = [num(100)];
  r2.pile = [num(1), num(2), num(3), num(4), num(5), num(6), num(7), num(8), num(9), num(10)];
  const berndCard = { id: 'bernd1', kind: 'special', key: 'bernd', name: 'Bernd', effects: [{ type: 'takePile', target: 'next' }] };
  berndPlayer.hand = [berndCard];
  r2.turn = 0;
  assert.equal(r2.play(berndPlayer.id, [berndCard.id]).ok, true);
  assert.equal(victimDorf.hand.length, 4, 'Dorfdepp nimmt maximal 3 Karten vom 10er Stapel (+1 vorherige Handkarte)');

  // Phönix bei takePile
  const r3 = table(2);
  const pA = r3.players[0];
  const pB = r3.players[1];
  pB.role = 'held';
  const ph = sp('phoenix');
  pB.hand = [ph, num(50)];
  r3.pile = [num(1), num(2), num(3)];
  r3.deck = [num(99)];
  const berndCard2 = { id: 'bernd2', kind: 'special', key: 'bernd', name: 'Bernd', effects: [{ type: 'takePile', target: 'next' }] };
  pA.hand = [berndCard2];
  r3.turn = 0;
  assert.equal(r3.play(pA.id, [berndCard2.id]).ok, true);
  assert.ok(!pB.hand.includes(ph), 'Phönix wurde verbraucht');
  assert.equal(r3.pile.length, 0, 'Tischstapel wurde zu Asche verbrannt');
});

test('🪶 Phönix-Asche (aktiv gespielt): Verbrennt Tischstapel und zieht 1 frische Karte', () => {
  const r = table(2);
  const p0 = r.current();
  const phCard = sp('phoenix');
  p0.hand = [phCard, num(10)];
  r.pile = [num(1), num(2), num(3)];
  r.deck = [num(77)];
  r.top = 10;

  assert.equal(r.play(p0.id, [phCard.id]).ok, true);
  assert.equal(r.top, 0, 'Tischwert wurde auf 0 gereinigt');
  assert.equal(r.pile.length, 0, 'Stapel wurde zu Asche verbrannt');
  assert.equal(p0.hand.length, 2, 'Phönix abgelegt (-1) und 1 frische Karte gezogen (+1)');
  assert.ok(p0.hand.some((c) => c.value === 77), 'Gezogene Karte stammt vom Deck');
});

test('🧑 Bürger*in: Lässt sich von Richtungswechseln nicht beirren (behält regulären nächsten Zug)', () => {
  const r = table(3);
  const p0 = r.players[0];
  const p1 = r.players[1];
  const p2 = r.players[2];

  p1.role = 'buerger';
  p2.role = 'held';
  r.dir = 1;
  r.turn = 0; // p0 ist am Zug, nächster in normaler Richtung wäre p1

  const reverseCard = { id: 'rev1', kind: 'special', key: 'reverse', name: 'Wende', effects: [{ type: 'reverse' }] };
  p0.hand = [reverseCard, num(5)];

  assert.equal(r.play(p0.id, [reverseCard.id]).ok, true);
  assert.equal(r.dir, -1, 'Richtung wurde umgekehrt');
  // Weil p1 Bürger*in ist, wurde p1 nicht übergangen, sondern darf regulär ziehen:
  assert.equal(r.current().id, p1.id, 'Bürger*in p1 behält den nächsten Zug');
});

test('💥 Schadenseffekt (Geben): Karten landen auf dem Ablagestapel statt in der Hand des Opfers', () => {
  const r = table(2);
  const p0 = r.current();
  const victim = r.seatFrom(p0, 1);
  victim.role = 'held';

  const cardA = num(1);
  const cardB = num(2);
  const dreizack = { id: 'drei', kind: 'special', key: 'louis', name: 'Dreizack', effects: [{ type: 'give', n: 2, target: 'next' }] };
  p0.hand = [dreizack, cardA, cardB];
  victim.hand = [num(10)];
  r.pile = [];

  assert.equal(r.play(p0.id, [dreizack.id]).ok, true);
  assert.equal(victim.hand.length, 1, 'Opfer hat KEINE Schadenskarten direkt auf die Hand bekommen');
  assert.equal(p0.hand.length, 0, 'Angreifer hat die 2 Karten abgelegt');
  assert.ok(r.pile.includes(cardA) && r.pile.includes(cardB), 'Abgelegte Schadenskarten liegen auf dem Ablagestapel');
});
