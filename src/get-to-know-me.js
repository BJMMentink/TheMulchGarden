import { APP_CONFIG } from './config.js';

const normalise = (value) => String(value || '').trim().toLocaleLowerCase();

const PREFERENCE_OPTIONS = Object.freeze([
  { id: 'love', label: 'Love it', rating: 5 },
  { id: 'like', label: 'Like it', rating: 4 },
  { id: 'neutral', label: 'Not sure yet', rating: 3 },
  { id: 'dislike', label: 'Not for me', rating: 1 },
]);

const QUESTION_SUBJECTS = Object.freeze([
  { id: 'creator-nuxinor', prompt: 'How do you feel about Nuxinor?', interestName: 'Nuxinor', category: 'creator', tags: ['gaming', 'commentary'] },
  { id: 'creator-luke-stephens', prompt: 'How do you feel about Luke Stephens?', interestName: 'Luke Stephens', category: 'creator', tags: ['gaming', 'game criticism'] },
  { id: 'creator-asmongold', prompt: 'How do you feel about Asmongold?', interestName: 'Asmongold', category: 'creator', tags: ['gaming', 'commentary'] },
  { id: 'creator-mrbeast', prompt: 'How do you feel about MrBeast?', interestName: 'MrBeast', category: 'creator', tags: ['entertainment', 'challenge'] },
  { id: 'creator-mark-rober', prompt: 'How do you feel about Mark Rober?', interestName: 'Mark Rober', category: 'creator', tags: ['science', 'engineering'] },
  { id: 'creator-marques-brownlee', prompt: 'How do you feel about Marques Brownlee?', interestName: 'Marques Brownlee', category: 'creator', tags: ['technology', 'reviews'] },
  { id: 'creator-pewdiepie', prompt: 'How do you feel about PewDiePie?', interestName: 'PewDiePie', category: 'creator', tags: ['gaming', 'commentary'] },
  { id: 'creator-linus-tech-tips', prompt: 'How do you feel about Linus Tech Tips?', interestName: 'Linus Tech Tips', category: 'creator', tags: ['technology', 'hardware'] },
  { id: 'game-rpgs', prompt: 'How do you feel about story-rich RPGs?', interestName: 'RPGs', category: 'game', tags: ['gaming', 'story', 'rpg'] },
  { id: 'game-action-rpgs', prompt: 'How do you feel about action RPGs?', interestName: 'Action RPGs', category: 'game', tags: ['gaming', 'action rpg'] },
  { id: 'game-indie', prompt: 'How do you feel about indie games?', interestName: 'Indie games', category: 'game', tags: ['gaming', 'indie'] },
  { id: 'game-competitive', prompt: 'How do you feel about competitive games?', interestName: 'Competitive games', category: 'game', tags: ['gaming', 'competitive'] },
  { id: 'game-sandbox', prompt: 'How do you feel about sandbox games?', interestName: 'Sandbox games', category: 'game', tags: ['gaming', 'sandbox', 'creative'] },
  { id: 'game-cozy', prompt: 'How do you feel about cozy games?', interestName: 'Cozy games', category: 'game', tags: ['gaming', 'cozy'] },
  { id: 'game-strategy', prompt: 'How do you feel about strategy games?', interestName: 'Strategy games', category: 'game', tags: ['gaming', 'strategy'] },
  { id: 'game-horror', prompt: 'How do you feel about horror games?', interestName: 'Horror games', category: 'game', tags: ['gaming', 'horror'] },
  { id: 'game-open-world', prompt: 'How do you feel about open-world games?', interestName: 'Open-world games', category: 'game', tags: ['gaming', 'open world'] },
  { id: 'game-design', prompt: 'How do you feel about game design?', interestName: 'Game design', category: 'topic', tags: ['gaming', 'design'] },
  { id: 'topic-ai', prompt: 'How do you feel about artificial intelligence?', interestName: 'Artificial intelligence', category: 'topic', tags: ['technology', 'software'] },
  { id: 'topic-software', prompt: 'How do you feel about software development?', interestName: 'Software development', category: 'topic', tags: ['technology', 'programming'] },
  { id: 'topic-art-education', prompt: 'How do you feel about art education?', interestName: 'Art education', category: 'topic', tags: ['professional', 'education', 'art'] },
  { id: 'topic-design', prompt: 'How do you feel about design?', interestName: 'Design', category: 'topic', tags: ['creative', 'art'] },
  { id: 'topic-science', prompt: 'How do you feel about science and engineering?', interestName: 'Science and engineering', category: 'topic', tags: ['science', 'engineering'] },
  { id: 'topic-hardware', prompt: 'How do you feel about technology hardware?', interestName: 'Technology hardware', category: 'topic', tags: ['technology', 'hardware'] },
  { id: 'topic-streaming', prompt: 'How do you feel about streaming culture?', interestName: 'Streaming culture', category: 'topic', tags: ['entertainment', 'gaming'] },
  { id: 'topic-history', prompt: 'How do you feel about history?', interestName: 'History', category: 'topic', tags: ['learning', 'story'] },
  { id: 'entertainment-movies', prompt: 'How do you feel about movies?', interestName: 'Movies', category: 'topic', tags: ['entertainment', 'story'] },
  { id: 'entertainment-tv', prompt: 'How do you feel about TV series?', interestName: 'TV series', category: 'topic', tags: ['entertainment', 'story'] },
  { id: 'entertainment-anime', prompt: 'How do you feel about anime?', interestName: 'Anime', category: 'topic', tags: ['entertainment', 'art'] },
  { id: 'entertainment-music', prompt: 'How do you feel about music?', interestName: 'Music', category: 'topic', tags: ['entertainment', 'creative'] },
  { id: 'entertainment-documentaries', prompt: 'How do you feel about documentaries?', interestName: 'Documentaries', category: 'topic', tags: ['entertainment', 'learning'] },
  { id: 'entertainment-comedy', prompt: 'How do you feel about comedy?', interestName: 'Comedy', category: 'topic', tags: ['entertainment', 'commentary'] },
  { id: 'life-productivity', prompt: 'How do you feel about productivity systems?', interestName: 'Productivity systems', category: 'keyword', tags: ['planning', 'professional'] },
  { id: 'life-morning-routines', prompt: 'How do you feel about morning routines?', interestName: 'Morning routines', category: 'keyword', tags: ['planning', 'health'] },
  { id: 'life-cooking', prompt: 'How do you feel about cooking?', interestName: 'Cooking', category: 'keyword', tags: ['home', 'creative'] },
  { id: 'life-fitness', prompt: 'How do you feel about fitness?', interestName: 'Fitness', category: 'keyword', tags: ['health', 'routine'] },
  { id: 'life-travel', prompt: 'How do you feel about travel?', interestName: 'Travel', category: 'keyword', tags: ['entertainment', 'learning'] },
  { id: 'life-personal-finance', prompt: 'How do you feel about personal finance?', interestName: 'Personal finance', category: 'keyword', tags: ['planning', 'professional'] },
  { id: 'life-collecting', prompt: 'How do you feel about collecting things?', interestName: 'Collecting', category: 'keyword', tags: ['hobby', 'creative'] },
  { id: 'life-making', prompt: 'How do you feel about making things with your hands?', interestName: 'Making things', category: 'keyword', tags: ['creative', 'art'] },
]);

const QUESTIONS = Object.freeze(QUESTION_SUBJECTS.map((subject) => ({
  ...subject,
  options: PREFERENCE_OPTIONS.map((option) => ({ ...option, interestName: subject.interestName, category: subject.category })),
})));

const GAME_THEMES = Object.freeze([
  { id: 'gaming', label: 'Playful signal', description: 'Your map currently leans toward games, creators, and interactive worlds.', signals: ['creator', 'game', 'gaming', 'rpg', 'commentary'] },
  { id: 'technology', label: 'Curious signal', description: 'Your map currently leans toward technology, tools, and figuring out how things work.', signals: ['technology', 'software', 'ai', 'artificial', 'intelligence', 'hardware', 'science'] },
  { id: 'creative', label: 'Making signal', description: 'Your map currently leans toward art, design, stories, and making things.', signals: ['art', 'design', 'creative', 'music', 'animation', 'story'] },
  { id: 'professional', label: 'Growing signal', description: 'Your map currently leans toward teaching, planning, and useful work.', signals: ['professional', 'teaching', 'education', 'planning', 'business'] },
  { id: 'everyday', label: 'Everyday signal', description: 'Your map is leaving room for practical interests and new directions.', signals: ['home', 'health', 'routine', 'hobby', 'travel', 'cooking'] },
]);

function tokens(values) {
  return new Set(values.flatMap((value) => normalise(value).split(/[^a-z0-9]+/).filter(Boolean)));
}

function questionScore(question, interests) {
  const signals = tokens([
    ...interests.map((interest) => interest.name),
    ...interests.map((interest) => interest.category),
  ]);
  return question.tags.filter((tag) => tokens([tag]).values().some((token) => signals.has(token))).length;
}

export function getGameTheme(interests = []) {
  const interestTokens = tokens([
    ...interests.map((interest) => interest.name),
    ...interests.map((interest) => interest.category),
  ]);
  return GAME_THEMES
    .map((theme, order) => ({ theme, order, score: theme.signals.filter((signal) => interestTokens.has(signal)).length }))
    .sort((left, right) => right.score - left.score || left.order - right.order)[0].theme;
}

export function createGetToKnowMeState() {
  return { version: 1, currentRound: 0, questionIndex: 0, roundQuestionIds: [], answers: [], completedRounds: 0 };
}

export function getQuestions() {
  return QUESTIONS;
}

export function startRound(gameState = createGetToKnowMeState(), interests = [], now = new Date().toISOString()) {
  const previousIds = new Set(gameState.roundQuestionIds || []);
  const ranked = QUESTIONS.map((question, order) => ({ question, order, score: questionScore(question, interests) }))
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .map(({ question }) => question);
  const fresh = ranked.filter((question) => !previousIds.has(question.id));
  const pool = [...fresh, ...ranked];
  const roundQuestionIds = pool.filter((question, index, all) => all.findIndex((item) => item.id === question.id) === index)
    .slice(0, APP_CONFIG.getToKnowMeQuestionCount)
    .map((question) => question.id);
  return { ...gameState, currentRound: gameState.currentRound + 1, questionIndex: 0, roundQuestionIds, startedAt: now };
}

export function getCurrentQuestion(gameState) {
  const questionId = gameState?.roundQuestionIds?.[gameState.questionIndex];
  return QUESTIONS.find((question) => question.id === questionId) || null;
}

export function recordAnswer(gameState, optionId, now = new Date().toISOString()) {
  const question = getCurrentQuestion(gameState);
  if (!question) throw new Error('Start a new round before answering.');
  const option = question.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error('That answer is not available.');
  const answer = { round: gameState.currentRound, questionId: question.id, optionId: option.id, interestName: option.interestName, category: option.category, rating: option.rating, createdAt: now };
  const questionIndex = gameState.questionIndex + 1;
  return {
    ...gameState,
    questionIndex,
    answers: [...(gameState.answers || []), answer],
    completedRounds: questionIndex >= gameState.roundQuestionIds.length ? gameState.completedRounds + 1 : gameState.completedRounds,
    completedAt: questionIndex >= gameState.roundQuestionIds.length ? now : gameState.completedAt,
  };
}
