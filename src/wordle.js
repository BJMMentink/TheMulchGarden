import { APP_CONFIG } from './config.js';

const WORDS = Object.freeze([
  'APPLE', 'BRAVE', 'CLOUD', 'DREAM', 'EMBER', 'FIELD', 'FLAME', 'GLOOM', 'GRACE', 'GRASS',
  'LIGHT', 'MULCH', 'NIGHT', 'QUIET', 'RIVER', 'ROOTS', 'SHARE', 'SPORE', 'STONE', 'TOWER',
]);

const dayNumber = (date) => Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);

export function getWordleDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function getDailyAnswer(date = new Date()) {
  return WORDS[dayNumber(date) % WORDS.length];
}

export function createWordleState(date = getWordleDate()) {
  return { version: 1, date, guesses: [], status: 'playing' };
}

export function resetWordleForDate(gameState, date = getWordleDate()) {
  return gameState?.date === date ? gameState : createWordleState(date);
}

export function scoreGuess(guess, answer) {
  const result = Array.from({ length: APP_CONFIG.wordleWordLength }, () => 'absent');
  const remaining = {};
  for (let index = 0; index < answer.length; index += 1) {
    if (guess[index] === answer[index]) result[index] = 'correct';
    else remaining[answer[index]] = (remaining[answer[index]] || 0) + 1;
  }
  for (let index = 0; index < guess.length; index += 1) {
    if (result[index] === 'correct') continue;
    if (remaining[guess[index]]) { result[index] = 'present'; remaining[guess[index]] -= 1; }
  }
  return result;
}

export function submitWordleGuess(gameState, rawGuess, answer) {
  const guess = String(rawGuess || '').trim().toLocaleUpperCase();
  if (gameState.status !== 'playing') throw new Error('This daily puzzle is complete.');
  if (guess.length !== APP_CONFIG.wordleWordLength || !/^[A-Z]+$/.test(guess)) throw new Error(`Enter a ${APP_CONFIG.wordleWordLength}-letter word.`);
  if (gameState.guesses.some((item) => item.word === guess)) throw new Error('You already tried that word.');
  const nextGuesses = [...gameState.guesses, { word: guess, result: scoreGuess(guess, answer) }];
  const solved = guess === answer;
  return { ...gameState, guesses: nextGuesses, status: solved ? 'won' : nextGuesses.length >= APP_CONFIG.wordleMaxGuesses ? 'lost' : 'playing' };
}

export function getWordleWords() { return WORDS; }
