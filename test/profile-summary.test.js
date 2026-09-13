import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePreferences } from '../src/profile-summary.js';

test('profile summary describes likes and saved dislikes without inventing details', () => {
  const summary = summarizePreferences([
    { name: 'Nuxinor', category: 'creator', rating: 5 },
    { name: 'Horror games', category: 'game', rating: 1 },
    { name: 'Design', category: 'topic', rating: 3 },
  ]);
  assert.match(summary.text, /Nuxinor/);
  assert.match(summary.text, /Horror games/);
  assert.match(summary.text, /Design/);
  assert.deepEqual(summary.likes, ['Nuxinor']);
  assert.deepEqual(summary.dislikes, ['Horror games']);
});

test('empty profile summary gives a useful next step', () => {
  const summary = summarizePreferences([]);
  assert.match(summary.text, /Get to know me/);
  assert.deepEqual(summary.likes, []);
  assert.deepEqual(summary.dislikes, []);
});
