export const APP_CONFIG = Object.freeze({
  appName: 'The Mulch Garden',
  storageKey: 'the-mulch-garden:v1',
  maxInterestRating: 5,
  minInterestRating: 1,
  defaultSection: 'dashboard',
  onboardingVersion: 1,
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
  { id: 'projects', label: 'Projects', icon: '▦' },
]);

export const INTEREST_CATEGORIES = Object.freeze([
  { id: 'creator', label: 'Creator' },
  { id: 'topic', label: 'Topic' },
  { id: 'game', label: 'Game' },
  { id: 'keyword', label: 'Keyword' },
]);

export const ONBOARDING_STEPS = Object.freeze([
  { id: 'creators', title: 'Creators you enjoy', prompt: 'Choose a few voices you want close to the surface.', category: 'creator', options: ['Nuxinor', 'Luke Stephens', 'Asmongold', 'Other creator'] },
  { id: 'gaming', title: 'Gaming', prompt: 'What kinds of games should shape your feed?', category: 'game', options: ['Action RPGs', 'Competitive games', 'Indie games', 'Game design'] },
  { id: 'technology', title: 'Technology & AI', prompt: 'Pick the areas that are worth your attention.', category: 'topic', options: ['Artificial intelligence', 'Software development', 'Creative tools', 'None for now'] },
  { id: 'entertainment', title: 'Entertainment', prompt: 'Add a little signal to your downtime.', category: 'topic', options: ['Movies', 'TV', 'Anime', 'Music'] },
  { id: 'professional', title: 'Professional interests', prompt: 'What will help your work grow?', category: 'topic', options: ['Teaching', 'Art education', 'Design', 'Small business'] },
]);
