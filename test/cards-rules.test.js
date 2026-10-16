// Mehr Tests für „TOPP DAS!“: Lobby, Spielablauf, Effekt-Baukasten, Regeln beim Legen – läuft mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardRoom } from '../server/cards/game.js';
import { RULES, BASIC_SPECIALS, PLAYER_CARDS } from '../shared/cards.js';

// Rollen sind im Test neutral (Bürger*in) – sonst funken Gott, Pazifist & Co. zufällig dazwischen.
// Wer die echten Zufallsrollen braucht: table(n, { randomRoles: true })
function table(n = 3, { randomRoles = false } = {}) {
  const r = new CardRoom('t');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, { name: 'P' + i, special: { effects: [{ type: 'reset' }] } });
  assert.equal(r.start('p0').ok, true);
  r.introUntil = 0;   // Intro-Animation im Test überspringen
  if (!randomRoles) for (const p of r.players) p.role = 'buerger';
  return r;
}
const num = (value) => ({ id: Math.random(), kind: 'number', value, color: '#fff' });
const fx = (...effects) => ({ id: 'fx' + Math.random(), kind: 'special', key: 'x', name: 'Test', emoji: '🧪', effects });
const sp = (key) => ({ id: key + Math.random(), kind: 'special', key, effects: [], ...PLAYER_CARDS[key] });

// Legt eine Special-Karte mit diesen Effekten – davor bekommt die aktuelle Person genau diese Hand
function playFx(r, effects, rest = [num(1)]) {
  const p = r.current();
  const c = fx(...effects);
  p.hand = [c, ...rest];
  const res = r.play(p.id, [c.id]);
  assert.equal(res.ok, true, res.error);
  return p;
}

// ── Lobby & Start ────────────────────────────────────────────
test('Lobby: Tisch ist bei RULES.maxPlayers voll', () => {
  const r = new CardRoom('t');
  for (let i = 0; i < RULES.maxPlayers; i++) assert.equal(r.addPlayer('p' + i, { name: 'P' + i }).ok, true);
  assert.match(r.addPlayer('zu-viel', { name: 'X' }).error, /voll/);
});

test('Lobby: kaputte Bomben-Karte wird zu Reset, zu langer Name wird gekürzt', () => {
  const r = new CardRoom('t');
  r.addPlayer('a', { name: 'A', special: { name: 'x'.repeat(50), effects: [{ type: 'hack' }] } });
  r.addPlayer('b', { name: 'Bea' });
  assert.deepEqual(r.players[0].special.effects, [{ type: 'reset' }]);
  assert.equal(r.players[0].special.name.length, 24);
  assert.equal(r.players[1].special.name, 'Beas Bombe');
});

test('Start: mindestens 2 Leute, nur der Host, nicht doppelt', () => {
  const r = new CardRoom('t');
  r.addPlayer('a', { name: 'A' });
  assert.match(r.start('a').error, /Mindestens 2/);
  r.addPlayer('b', { name: 'B' });
  assert.match(r.start('b').error, /Nur der Host/);
  assert.equal(r.start('a').ok, true);
  assert.match(r.start('a').error, /Läuft schon/);
});

test('Start: ab 5 Leuten liegen alle Zahlenkarten doppelt im Spiel', () => {
  const perSet = RULES.colors.length * (RULES.maxValue - RULES.minValue + 1);
  const isNum = (c) => c.kind === 'number';   // im Deck liegen auch übrige Specials
  const numbers = (r) => r.deck.filter(isNum).length + r.players.reduce((s, p) => s + p.hand.filter(isNum).length, 0);
  assert.equal(numbers(table(4)), perSet);
  assert.equal(numbers(table(5)), perSet * 2);
});

test('Wer während eines Spiels kommt, schaut zu und ist nie dran', () => {
  const r = table(2);
  r.addPlayer('late', { name: 'Late' });
  const late = r.players.find((p) => p.id === 'late');
  assert.equal(late.inGame, false);
  for (let i = 0; i < 6; i++) { r.advance(1); assert.notEqual(r.current(), late); }
});

// ── Kommen & Gehen ───────────────────────────────────────────
test('In der Lobby ist weg, wer die Verbindung verliert', () => {
  const r = new CardRoom('t');
  r.addPlayer('a', { name: 'A' });
  r.disconnect('a');
  assert.equal(r.players.length, 0);
});

test('Wer im Spiel geht: Karten zurück ins Deck – unter 2 Leuten ist Schluss', () => {
  const r = table(3);
  const leaving = r.players.find((p) => p !== r.current());
  const deck = r.deck.length, hand = leaving.hand.length;
  r.removePlayer(leaving.id);
  assert.equal(r.deck.length, deck + hand);
  assert.equal(r.state, 'playing');
  r.removePlayer(r.players.find((p) => p !== r.current()).id);
  assert.equal(r.state, 'over');
  assert.equal(r.winner, r.players[0].id);
});

test('Wer dran ist und geht: die nächste Person ist dran – in beiden Richtungen', () => {
  for (const dir of [1, -1]) {
    const r = table(4);
    r.dir = dir;
    const cur = r.current();
    const next = r.seatFrom(cur, 1);
    r.removePlayer(cur.id);
    assert.equal(r.current(), next, `Richtung ${dir}`);
  }
});

test('Wer zu lange weg ist, wird ganz rausgenommen', () => {
  const r = table(3);
  const p = r.players.find((o) => o !== r.current());
  r.disconnect(p.id);
  assert.equal(r.tick(Date.now() + 1000), false);
  assert.equal(r.tick(Date.now() + (RULES.awayKickSeconds + 1) * 1000), true);
  assert.equal(r.players.includes(p), false);
});

// ── Was die Browser sehen ────────────────────────────────────
test('Sicht: eigene Hand komplett, von anderen nur die Anzahl – Rollen erst am Ende offen', () => {
  const r = table(3);
  const v = r.view('p0');
  assert.equal(v.hand.length, r.players[0].hand.length);
  for (const p of v.players) assert.equal('hand' in p, false);
  assert.equal(v.players.find((p) => p.id === 'p1').count, r.players[1].hand.length);
  assert.deepEqual(r.view('zuschauer').hand, []);
  r.finish(r.players[0]);
  assert.ok(r.view('p0').players.every((p) => p.role && !p.secret));
});

test('Sicht: vom Stapel sieht man nur die obersten 4 Karten', () => {
  const r = table(2);
  r.pile = [1, 2, 3, 4, 5, 6].map(num);
  const v = r.view('p0');
  assert.equal(v.pile.length, 4);
  assert.equal(v.pileCount, 6);
});

test('Bilder: arts() liefert Avatar und Kartenbild pro Person', () => {
  const r = new CardRoom('t');
  r.addPlayer('a', { name: 'A', avatar: 'data:image/png;base64,AA', special: { art: 'data:image/jpeg;base64,BB' } });
  assert.deepEqual(r.arts(), { a: { avatar: 'data:image/png;base64,AA', art: 'data:image/jpeg;base64,BB' } });
});

// ── Legen: was geht, was nicht ───────────────────────────────
test('Legen: ohne Karte, fremde Karte oder doppelte ID geht nicht', () => {
  const r = table(2);
  const p = r.current();
  p.hand = [num(3), num(4)];
  assert.match(r.play(p.id, []).error, /Keine Karte/);
  assert.match(r.play(p.id, ['gibts-nicht']).error, /nicht auf deiner Hand/);
  assert.match(r.play(p.id, [p.hand[0].id, p.hand[0].id]).error, /nicht auf deiner Hand/);
});

test('Legen: auf leeren Stapel geht alles, gleiche Zahl ist erlaubt, verschiedene Zahlen zusammen nicht', () => {
  const r = table(2);
  let p = r.current();
  p.hand = [num(1), num(9)];
  assert.equal(r.play(p.id, [p.hand[0].id]).ok, true);
  p = r.current();
  p.hand = [num(3), num(4), num(1), num(5)];
  assert.match(r.play(p.id, [p.hand[0].id, p.hand[1].id]).error, /gleiche Zahlen/);
  assert.equal(r.play(p.id, [p.hand[2].id]).ok, RULES.equalAllowed);
});

test('Legen: Specials nur einzeln', () => {
  const r = table(2);
  const p = r.current();
  p.hand = [fx({ type: 'reset' }), fx({ type: 'burn' }), num(1)];
  assert.match(r.play(p.id, [p.hand[0].id, p.hand[1].id]).error, /einzeln/);
});

test('Legen: Fehler lassen Hand und Stapel unverändert', () => {
  const r = table(2);
  const p = r.current();
  const sad = sp('traurig');
  p.hand = [sad, num(1)];
  r.pile = [num(2)];
  assert.match(r.play(p.id, { ids: [sad.id], choice: {} }).error, /weinen/);
  assert.equal(p.hand.length, 2);
  assert.equal(r.pile.length, 1);
  assert.equal(r.current(), p);
});

test('Legen: Zwillings-Parade braucht zwei verschiedene, echte Farben', () => {
  const r = table(2);
  const p = r.current();
  const tw = sp('zwillinge');
  p.hand = [tw, num(1)];
  const [c1] = RULES.colors;
  for (const colors of [undefined, [c1], [c1, c1], [c1, '#000000']]) {
    assert.match(r.play(p.id, { ids: [tw.id], choice: { colors } }).error, /zwei Farben/);
  }
});

test('Legen: Lachen und Weinen braucht zwei verschiedene Personen', () => {
  const r = table(3);
  const p = r.current();
  const t = r.players.find((o) => o !== p);
  const lucky = sp('gluecklich'), sad = sp('traurig');
  p.hand = [lucky, sad, num(1)];
  assert.match(r.play(p.id, { ids: [lucky.id, sad.id], choice: { targets: [t.id, t.id] } }).error, /zwei verschiedene/);
  assert.match(r.play(p.id, { ids: [lucky.id, sad.id], choice: { targets: [p.id, t.id] } }).error, /zwei verschiedene/);
});

test('♊ Sphäre: liegt die Zwillings-Parade oben, geht genau 1 drunter', () => {
  const r = table(2);
  const p = r.current();
  r.pile = [sp('zwillinge')];
  r.top = 8;
  p.hand = [num(6), num(7), num(1)];
  assert.match(r.play(p.id, [p.hand[0].id]).error, /≥ 8/);
  assert.equal(r.play(p.id, [p.hand[1].id]).ok, true);
});

test('Stapel nehmen geht nicht, wenn er leer ist', () => {
  const r = table(2);
  r.pile = [];
  assert.match(r.take(r.current().id).error, /leer/);
});

test('Letzte Karte ist ein Special → trotzdem gewonnen', () => {
  const r = table(2);
  const p = playFx(r, [{ type: 'reset' }], []);
  assert.equal(r.state, 'over');
  assert.equal(r.winner, p.id);
});

// ── Effekt-Baukasten ─────────────────────────────────────────
test('🔄 Reset: Stapel zählt wieder ab 0, „Unter“ ist vorbei', () => {
  const r = table(2);
  r.top = 12; r.lower = true;
  playFx(r, [{ type: 'reset' }]);
  assert.equal(r.top, 0);
  assert.equal(r.lower, false);
});

test('🔥 Feuer: Stapel brennt weg und man ist nochmal dran', () => {
  const r = table(2);
  r.pile = [num(5), num(9)]; r.top = 9;
  const p = playFx(r, BASIC_SPECIALS.burn.effects);
  assert.equal(r.pile.length, 0);
  assert.equal(r.top, 0);
  assert.equal(r.current(), p);
});

test('👑 Boss: zählt als 16 – darauf passt keine Zahl', () => {
  const r = table(2);
  playFx(r, [{ type: 'boss' }]);
  const q = r.current();
  q.hand = [num(RULES.maxValue), num(1)];
  assert.match(r.play(q.id, [q.hand[0].id]).error, /≥ 16/);
});

test('🔁 Wende: Richtung dreht sich, die vorherige Person ist dran', () => {
  const r = table(3);
  const prev = r.seatFrom(r.current(), -1);
  playFx(r, [{ type: 'reverse' }]);
  assert.equal(r.dir, -1);
  assert.equal(r.current(), prev);
});

test('⏭️ Aussetzen: n Personen werden übersprungen', () => {
  const r = table(4);
  const expected = r.seatFrom(r.current(), 3);
  playFx(r, [{ type: 'skip', n: 2 }]);
  assert.equal(r.current(), expected);
});

test('🎁 Abgeben: n Karten wandern zur Zielperson', () => {
  const r = table(3);
  const t = r.seatFrom(r.current(), 1);
  t.hand = [num(9)];
  const p = playFx(r, [{ type: 'give', n: 2, target: 'next' }], [num(1), num(2), num(3)]);
  assert.equal(p.hand.length, 1);
  assert.equal(t.hand.length, 3);
});

test('📥 Ziehen lassen: trifft die richtige Person (vorherige, wenigste, meiste)', () => {
  for (const target of ['prev', 'fewest', 'most']) {
    const r = table(3);
    const p = r.current();
    const [a, b] = [r.seatFrom(p, 1), r.seatFrom(p, -1)];
    a.hand = [num(1)]; b.hand = [num(1), num(2), num(3)];
    const hit = { prev: b, fewest: a, most: b }[target];
    const before = hit.hand.length;
    playFx(r, [{ type: 'draw', n: 2, target }]);
    assert.equal(hit.hand.length, before + 2, target);
  }
});

test('📥 Ziehen bei fast leerem Deck: so viel wie da ist', () => {
  const r = table(2);
  const t = r.seatFrom(r.current(), 1);
  t.hand = [num(1)];
  r.deck = [num(4)];
  playFx(r, [{ type: 'draw', n: 3, target: 'next' }]);
  assert.equal(t.hand.length, 2);
  assert.ok(r.log.some((l) => l.includes('Stapel leer')));
});

test('🗑️ Stapel kassieren: Zielperson nimmt alles inklusive der Karte', () => {
  const r = table(3);
  const t = r.seatFrom(r.current(), 1);
  t.hand = [num(1)];
  r.pile = [num(3), num(4)]; r.top = 4;
  playFx(r, [{ type: 'takePile', target: 'next' }]);
  assert.equal(t.hand.length, 1 + 3);
  assert.equal(r.pile.length, 0);
  assert.equal(r.top, 0);
});

test('🃏 Hand tauschen: mit der Person, die am meisten hat', () => {
  const r = table(3);
  const p = r.current();
  const [a, b] = [r.seatFrom(p, 1), r.seatFrom(p, -1)];
  a.hand = [num(2), num(3), num(4)]; b.hand = [num(5)];
  playFx(r, [{ type: 'swap', target: 'most' }], [num(1)]);
  assert.deepEqual(p.hand.map((c) => c.value), [2, 3, 4]);
  assert.deepEqual(a.hand.map((c) => c.value), [1]);
});

test('🌀 Karussell: jede*r gibt 1 Karte in Spielrichtung weiter', () => {
  const r = table(3);
  r.turn = 0;
  r.players[1].hand = [num(2)];
  r.players[2].hand = [num(3)];
  playFx(r, [{ type: 'rotate' }], [num(1)]);
  assert.deepEqual(r.players.map((p) => p.hand.map((c) => c.value)), [[3], [1], [2]]);
});

test('😆 Glücklicher Schelm kontert auch Abgeben, Tauschen und Stapel-Kassieren', () => {
  for (const effect of [{ type: 'give', n: 2, target: 'next' }, { type: 'swap', target: 'next' }, { type: 'takePile', target: 'next' }]) {
    const r = table(2);
    const p = r.current();
    const t = r.seatFrom(p, 1);
    t.hand = [sp('gluecklich'), num(9)];
    r.pile = [num(4)];
    const c = fx(effect);
    p.hand = [c, num(1), num(2)];
    r.play(p.id, [c.id]);
    assert.equal(t.hand.length, 1, effect.type);                       // Schelm verbraucht, sonst nichts passiert
    // Beim Stapel-Kassieren landet der verbrauchte Schelm im Stapel – den nimmt man dann mit
    assert.equal(p.hand.length, effect.type === 'takePile' ? 2 + 3 : 2, effect.type);
  }
});

test('🥔 Kartoffel an den Glücklichen Schelm: bleibt bei dir – und du ziehst dreifach', () => {
  const r = table(2);
  const p = r.current();
  const t = r.seatFrom(p, 1);
  const potato = sp('kartoffel');
  p.hand = [potato, num(5)];
  t.hand = [sp('gluecklich'), num(1)];
  assert.equal(r.play(p.id, { ids: [potato.id], choice: { target: t.id } }).ok, true);
  assert.ok(p.hand.includes(potato));
  assert.equal(p.hand.length, 2 + 9);
  assert.equal(t.hand.length, 1);
});

// ── ☝️ Letzte Karte! ─────────────────────────────────────────
// Legt die erste von zwei Karten – danach hat die aktuelle Person genau noch eine
function downToOne(r) {
  const p = r.current();
  p.hand = [num(5), num(9)];
  assert.equal(r.play(p.id, [p.hand[0].id]).ok, true);
  assert.equal(p.hand.length, 1);
  return p;
}
const LATER = () => Date.now() + 60_000;

test('Letzte Karte: wer auf 1 Karte kommt, bekommt den Knopf – nur er/sie sieht ihn', () => {
  const r = table(2);
  const p = downToOne(r);
  const other = r.players.find((o) => o !== p);
  const lc = r.view(p.id).lastCall;
  assert.ok(lc && lc.ms > 0 && lc.ms <= RULES.lastCardSeconds * 1000, JSON.stringify(lc));
  assert.equal(r.view(other.id).lastCall, null);
  assert.equal(r.expireLastCalls(Date.now()), false);   // noch Zeit
  assert.ok(r.nextLastCallIn() > 0);
});

test('Letzte Karte: rechtzeitig gedrückt → keine Strafe, kein zweiter Knopf', () => {
  const r = table(2);
  const p = downToOne(r);
  assert.equal(r.callLast(p.id).ok, true);
  assert.match(r.log.join('\n'), /LETZTE KARTE/);
  assert.equal(r.view(p.id).lastCall, null);
  assert.equal(r.nextLastCallIn(), null);
  r.watchLastCards();                                    // nächster Zug: bleibt erledigt
  assert.equal(r.view(p.id).lastCall, null);
  assert.equal(r.expireLastCalls(LATER()), false);
  assert.equal(p.hand.length, 1);
});

test('Letzte Karte: verpasst → zufällig 3 bis 4 Strafkarten (auch über den Sekundentakt)', () => {
  const [min, max] = RULES.lastCardPenalty;
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const r = table(2);
    const p = downToOne(r);
    if (i % 2) assert.equal(r.expireLastCalls(LATER()), true);
    else assert.equal(r.tick(LATER()), true);
    const drawn = p.hand.length - 1;
    assert.ok(drawn >= min && drawn <= max, `${drawn} gezogen`);
    seen.add(drawn);
    assert.equal(r.view(p.id).lastCall, null);
    assert.match(r.log.join('\n'), /verpennt/);
    assert.equal(r.expireLastCalls(LATER()), false);    // nur einmal bestraft
  }
  assert.equal(seen.size, max - min + 1, 'mal 3, mal 4');
});

test('Letzte Karte: ohne Anlass oder zu spät drücken bringt nichts', () => {
  const r = table(2);
  assert.match(r.callLast(r.current().id).error, /nichts/);
  const p = downToOne(r);
  assert.match(r.callLast(p.id, LATER()).error, /spät/);
  assert.equal(r.expireLastCalls(LATER()), true);       // die Strafe kommt trotzdem
});

test('Letzte Karte: wer vorher wieder Karten bekommt, wird nicht bestraft – bei 1 Karte gibt es eine neue Chance', () => {
  const r = table(2);
  const p = downToOne(r);
  const first = r.view(p.id).lastCall.token;
  p.hand.push(num(2), num(3));
  r.watchLastCards();
  assert.equal(r.view(p.id).lastCall, null);
  assert.equal(r.expireLastCalls(LATER()), false);
  assert.equal(p.hand.length, 3);
  p.hand.splice(1);
  r.watchLastCards();
  assert.ok(r.view(p.id).lastCall.token > first);
});

test('Letzte Karte: letzte Karte gleich gelegt → Sieg, keine Strafe danach', () => {
  const r = table(2);
  const p = downToOne(r);
  r.turn = r.players.indexOf(p);
  assert.equal(r.play(p.id, [p.hand[0].id]).ok, true);
  assert.equal(r.state, 'over');
  assert.equal(r.winner, p.id);
  assert.equal(r.expireLastCalls(LATER()), false);
  assert.equal(r.view(p.id).lastCall, null);
});

test('Letzte Karte: neues Spiel startet ohne alte Knöpfe', () => {
  const r = table(2);
  const p = downToOne(r);
  r.finish(null);
  assert.equal(r.start(r.host().id).ok, true);
  assert.equal(p.lastCall, null);
  assert.equal(r.nextLastCallIn(), null);
});
