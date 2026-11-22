import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startPicker, vote, winnerId, randomWinner } from './selection.ts';
test('one yes waits until the full round finishes', () => {
  let s = vote(startPicker(['a','b','c']), true);
  assert.equal(s.result, 'picking');
  s = vote(vote(s, false), false);
  assert.equal(s.result, 'winner'); assert.equal(winnerId(s), 'a');
});

test('random choice gives every project an equal interval and leaves the collection intact', () => {
  const ids = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < ids.length; i++) {
    for (const offset of [0, 0.5, 0.999999]) {
      const selected = randomWinner(ids, () => (i + offset) / ids.length);
      assert.equal(selected.result, 'winner');
      assert.equal(winnerId(selected), ids[i]);
    }
  }
  assert.deepEqual(ids, ['a', 'b', 'c', 'd']);
});

test('random choice handles empty and single-project collections without rolling', () => {
  const neverRoll = () => { throw new Error('No random number needed'); };
  assert.equal(randomWinner([], neverRoll).result, 'empty');
  assert.equal(winnerId(randomWinner(['a'], neverRoll)), 'a');
});
test('all yes, all no, next round and empty/single states', () => {
  assert.equal(vote(vote(startPicker(['a','b']),true),true).result,'all');
  assert.equal(vote(vote(startPicker(['a','b']),false),false).result,'empty');
  const s = vote(vote(vote(startPicker(['a','b','c']),true),false),true);
  assert.equal(s.result,'next'); assert.deepEqual(s.accepted,['a','c']);
  assert.equal(startPicker(s.accepted,2).round,2);
  assert.equal(startPicker([]).result,'empty');
  assert.equal(startPicker(['a']).result,'winner');
  assert.equal(winnerId(startPicker(['a'])),'a');
});
