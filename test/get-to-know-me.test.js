import test from 'node:test';
import assert from 'node:assert/strict';
import { createGetToKnowMeState, getCurrentQuestion, getGameTheme, getQuestions, recordAnswer, startRound } from '../src/get-to-know-me.js';

test('Get to know me starts with exactly twenty questions', () => {
  const game = startRound(createGetToKnowMeState(), [{ name: 'Nuxinor', category: 'creator', rating: 5 }]);
  assert.equal(game.roundQuestionIds.length, 20);
  assert.equal(game.currentRound, 1);
  assert.equal(getCurrentQuestion(game).id, game.roundQuestionIds[0]);
});

test('a completed round records answers and counts as learned signal', () => {
  let game = startRound(createGetToKnowMeState(), []);
  const firstQuestion = getCurrentQuestion(game);
  for (let index = 0; index < 20; index += 1) {
    const question = getCurrentQuestion(game);
    game = recordAnswer(game, question.options[index === 0 ? 0 : 1].id, '2026-09-13T00:00:00.000Z');
  }
  assert.equal(game.answers.length, 20);
  assert.equal(game.completedRounds, 1);
  assert.equal(getCurrentQuestion(game), null);
  assert.equal(game.answers[0].questionId, firstQuestion.id);
});

test('the next round avoids the immediately previous questions', () => {
  const firstRound = startRound(createGetToKnowMeState(), []);
  const secondRound = startRound({ ...firstRound, questionIndex: firstRound.roundQuestionIds.length, completedRounds: 1 }, []);
  const firstIds = new Set(firstRound.roundQuestionIds);
  assert.equal(secondRound.roundQuestionIds.length, 20);
  assert.ok(secondRound.roundQuestionIds.every((id) => !firstIds.has(id)));
  assert.ok(getQuestions().length >= 40);
});

test('the game theme follows the strongest preference signals', () => {
  assert.equal(getGameTheme([{ name: 'Artificial intelligence', category: 'topic', rating: 5 }]).id, 'technology');
  assert.equal(getGameTheme([{ name: 'Design', category: 'topic', rating: 5 }]).id, 'creative');
});
