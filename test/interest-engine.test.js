import test from 'node:test';
import assert from 'node:assert/strict';
import { clampRating, createInterest, scoreContent, suggestInterestCandidates } from '../src/interest-engine.js';

test('clampRating keeps ratings within the configured 1–5 range', () => {
  assert.equal(clampRating(-2), 1);
  assert.equal(clampRating(3.6), 4);
  assert.equal(clampRating(9), 5);
});

test('scoreContent combines creator and topic signals', () => {
  const interests = [
    { name: 'Nuxinor', category: 'creator', rating: 3 },
    { name: 'Artificial intelligence', category: 'topic', rating: 5 },
  ];
  const result = scoreContent({ creator: 'Nuxinor', title: 'Artificial intelligence tools' }, interests);
  assert.equal(result.score, 4);
  assert.equal(result.matches.length, 2);
});

test('createInterest rejects an empty name and preserves category/rating', () => {
  assert.throws(() => createInterest({ name: '   ', category: 'topic', rating: 3 }));
  const interest = createInterest({ name: 'Game design', category: 'topic', rating: 4 });
  assert.equal(interest.name, 'Game design');
  assert.equal(interest.rating, 4);
});

test('suggestInterestCandidates derives new suggestions from existing interests', () => {
  const suggestions = suggestInterestCandidates([{ name: 'Nuxinor', category: 'creator', rating: 5 }]);
  assert.ok(suggestions.some((suggestion) => suggestion.name === 'Game criticism'));
  assert.ok(!suggestions.some((suggestion) => suggestion.name === 'Nuxinor'));
});
