import test from 'node:test';
import assert from 'node:assert/strict';
import { createWordleState, getDailyAnswer, resetWordleForDate, scoreGuess, submitWordleGuess } from '../src/wordle.js';

test('Daily Wordle chooses a deterministic five-letter answer', () => {
  assert.equal(getDailyAnswer(new Date('2026-09-13T12:00:00Z')).length, 5);
  assert.equal(getDailyAnswer(new Date('2026-09-13T08:00:00Z')), getDailyAnswer(new Date('2026-09-13T23:00:00Z')));
});

test('Wordle scores repeated letters correctly', () => {
  assert.deepEqual(scoreGuess('SPORE', 'ROOTS'), ['present', 'absent', 'correct', 'present', 'absent']);
});

test('Wordle completes on a correct guess and preserves daily progress', () => {
  const state = createWordleState('2026-09-13');
  const next = submitWordleGuess(state, 'roots', 'ROOTS');
  assert.equal(next.status, 'won');
  assert.equal(next.guesses.length, 1);
  assert.equal(resetWordleForDate(next, '2026-09-13'), next);
  assert.notEqual(resetWordleForDate(next, '2026-09-14').date, next.date);
});
