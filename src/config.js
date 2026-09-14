export const APP_CONFIG = Object.freeze({
  appName: 'The Mulch Garden',
  storageKey: 'the-mulch-garden:v1',
  maxInterestRating: 5,
  minInterestRating: 1,
  defaultSection: 'dashboard',
  getToKnowMeQuestionCount: 20,
  wordleWordLength: 5,
  wordleMaxGuesses: 6,
  profileSummaryNameLimit: 3,
  chatMaxMessageLength: 280,
  chatMaxMessages: 100,
  chatTimestampGapMs: 30 * 60 * 1000,
  chatPollIntervalMs: 10 * 1000,
  maxTodoTitleLength: 120,
  maxTodoTags: 8,
  maxTodoTagLength: 32,
  maxAccounts: 2,
});

export const USER_ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

export const SECTIONS = Object.freeze([
  { id: 'dashboard', label: 'Today', icon: '⌂' },
  { id: 'todos', label: 'Todos', icon: '✓' },
  { id: 'interests', label: 'Interests', icon: '✦' },
  { id: 'games', label: 'Games', icon: '◇' },
  { id: 'projects', label: 'Projects', icon: '▦' },
]);

export const INTEREST_CATEGORIES = Object.freeze([
  { id: 'creator', label: 'Creator' },
  { id: 'topic', label: 'Topic' },
  { id: 'game', label: 'Game' },
  { id: 'keyword', label: 'Keyword' },
]);
