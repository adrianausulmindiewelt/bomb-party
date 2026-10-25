import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardRoom } from '../server/cards/game.js';
import { QUIZ } from '../shared/quiz.js';

function playing() {
  const r = new CardRoom('quiz');
  for (const id of ['a', 'b', 'c']) r.addPlayer(id, { name: id.toUpperCase(), special: { effects: [{ type: 'reset' }] } });
  r.start('a'); r.introUntil = 0;
  return r;
}

test('Quiz: Fragenkatalog ist sauber', () => {
  for (const q of QUIZ) {
    assert.ok(q.length >= 4 && q.length <= 6, q[0]);
    assert.equal(new Set(q.slice(1)).size, q.length - 1, 'doppelte Antwort: ' + q[0]);
  }
});

test('Quiz: kommt nach der Zeit, richtige Antwort gibt Bonus, falsche nicht', () => {
  const r = playing();
  assert.equal(r.quizTick(r.nextQuizAt - 1), false);
  assert.equal(r.quizTick(r.nextQuizAt), true);
  const q = r.view('a').quiz;
  assert.ok(q && q.options.length >= 3);
  assert.equal('correct' in q, false);                     // Lösung bleibt geheim
  const right = r.quiz.correct, wrong = (right + 1) % q.options.length;
  const before = { a: r.players[0].hand.length, b: r.players[1].hand.length, c: r.players[2].hand.length };
  assert.equal(r.quizAnswer('a', { id: q.id, idx: right }).ok, true);
  assert.ok(r.quizAnswer('a', { id: q.id, idx: right }).error);   // nur einmal
  r.quizAnswer('b', { id: q.id, idx: wrong });
  r.quizAnswer('c', { id: q.id, idx: wrong });               // alle haben geantwortet → sofort aufgelöst
  assert.equal(r.quiz, null);
  const res = r.view('a').quizResult;
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].id, 'a');
  assert.ok(['drop3', 'special', 'punish'].includes(res.results[0].kind));
  const total = r.players.reduce((n, p) => n + p.hand.length, 0);
  assert.notEqual(total, before.a + before.b + before.c);
  assert.ok(r.nextQuizAt > Date.now() + 90_000);
});

test('Quiz: Abwerfen kann nie den Sieg schenken', () => {
  const r = playing();
  const p = r.players[0];
  p.hand = [p.hand[0]];
  for (let i = 0; i < 30; i++) { r.quizBonus(p); assert.ok(p.hand.length >= 1); }
});

test('Quiz: view liefert quizNextIn Countdown während des Spiels', () => {
  const r = playing();
  const v = r.view('a');
  assert.ok(typeof v.quizNextIn === 'number');
  assert.ok(v.quizNextIn > 0);
});
