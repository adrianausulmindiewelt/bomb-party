import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardRoom } from '../server/cards/game.js';
import { STAKE_DEFAULTS, STAKE_LIMITS } from '../shared/stakes.js';

function room() {
  const r = new CardRoom('einsatz');
  for (const id of ['a', 'b', 'c']) r.addPlayer(id, { name: id.toUpperCase(), special: { effects: [{ type: 'reset' }] } });
  return r;
}

test('Einsatz: Abstimmen, Stimme ändern, zurücknehmen', () => {
  const r = room();
  const v = r.view('a').stakes;
  assert.equal(v.reward.length, STAKE_DEFAULTS.reward.length);
  assert.equal(v.punish.length, STAKE_DEFAULTS.punish.length);
  assert.equal(r.stakeVote('a', { kind: 'punish', id: 'punish-0' }).ok, true);
  assert.equal(r.view('a').stakes.punishMine, 'punish-0');
  assert.equal(r.stakeVote('a', { kind: 'punish', id: 'punish-1' }).ok, true);
  assert.equal(r.view('b').stakes.punish.find((o) => o.id === 'punish-1').votes, 1);
  assert.equal(r.view('b').stakes.punish.find((o) => o.id === 'punish-0').votes, 0);
  assert.equal(r.stakeVote('a', { kind: 'punish', id: 'punish-1' }).ok, true);   // nochmal = zurück
  assert.equal(r.view('a').stakes.punishMine, null);
  assert.ok(r.stakeVote('a', { kind: 'quatsch', id: 'x' }).error);
  assert.ok(r.stakeVote('a', { kind: 'punish', id: 'gibts-nicht' }).error);
});

test('Einsatz: eigene Ideen mit Limits, Mehrheit gewinnt beim Start, Ergebnis am Ende', () => {
  const r = room();
  assert.ok(r.stakeSuggest('a', { kind: 'punish', text: 'x' }).error);
  assert.equal(r.stakeSuggest('a', { kind: 'punish', text: 'Muss den Tisch abräumen' }).ok, true);
  assert.ok(r.stakeSuggest('b', { kind: 'punish', text: 'muss den tisch  abräumen' }).error);   // Dublette
  const own = r.view('a').stakes.punish.at(-1);
  assert.equal(own.by, 'A');
  assert.equal(r.view('a').stakes.punishMine, own.id);
  r.stakeVote('b', { kind: 'punish', id: own.id });
  r.stakeVote('c', { kind: 'punish', id: 'punish-2' });
  r.stakeVote('a', { kind: 'reward', id: 'reward-3' });
  for (let i = 0; i < STAKE_LIMITS.perPlayer - 1; i++) assert.equal(r.stakeSuggest('a', { kind: 'punish', text: `Idee Nummer ${i}` }).ok, true);
  assert.ok(r.stakeSuggest('a', { kind: 'punish', text: 'Eine zu viel' }).error);
  r.stakeVote('a', { kind: 'punish', id: own.id });

  assert.equal(r.start('a').ok ?? true, true);
  assert.equal(r.state, 'playing');
  assert.equal(r.stake.punish.text, 'Muss den Tisch abräumen');
  assert.equal(r.stake.punish.votes, 2);
  assert.equal(r.stake.reward.text, STAKE_DEFAULTS.reward[3]);
  assert.ok(r.stakeVote('a', { kind: 'reward', id: 'reward-0' }).error);             // nicht während der Runde
  assert.equal(r.view('a').stakes.punishMine, null);                                  // Stimmen sind zurückgesetzt

  const [a, b, c] = r.players;
  a.hand = []; b.hand = [{ id: 1 }, { id: 2 }]; c.hand = [{ id: 3 }];
  r.finish(a);
  assert.deepEqual(r.view('b').stake.winners, ['A']);
  assert.deepEqual(r.view('b').stake.losers, ['B']);
});

test('Einsatz: ohne Stimmen entscheidet der Zufall', () => {
  const r = room();
  r.start('a');
  assert.ok(STAKE_DEFAULTS.reward.includes(r.stake.reward.text));
  assert.equal(r.stake.reward.random, true);
});
