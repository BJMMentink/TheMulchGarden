import { APP_CONFIG } from './config.js';

const normalise = (value) => String(value || '').trim().toLocaleLowerCase();

export function clampRating(rating) {
  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating)) return APP_CONFIG.minInterestRating;
  return Math.min(APP_CONFIG.maxInterestRating, Math.max(APP_CONFIG.minInterestRating, Math.round(numericRating)));
}

export function createInterest({ name, category, rating, source = 'user' }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Interest name is required.');
  return {
    id: `${category}-${normalise(cleanName).replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
    name: cleanName,
    category,
    rating: clampRating(rating),
    source,
  };
}

export function scoreContent(content, interests) {
  const haystack = [content.creator, content.topic, content.title, ...(content.tags || [])].map(normalise).filter(Boolean);
  const matches = interests.filter((interest) => haystack.some((value) => value.includes(normalise(interest.name))));
  if (!matches.length) return { score: 0, matches: [] };

  const creatorScores = matches.filter((interest) => interest.category === 'creator').map((interest) => interest.rating);
  const topicScores = matches.filter((interest) => interest.category !== 'creator').map((interest) => interest.rating);
  const creatorScore = creatorScores.length ? Math.max(...creatorScores) : 0;
  const topicScore = topicScores.length ? Math.max(...topicScores) : 0;
  const score = creatorScore && topicScore ? Math.round((creatorScore + topicScore) / 2 * 10) / 10 : Math.max(creatorScore, topicScore);
  return { score, matches };
}

export function recordFeedback(state, contentId, action) {
  const allowedActions = new Set(['more', 'less', 'not-interested', 'always-creator']);
  if (!allowedActions.has(action)) throw new Error(`Unsupported feedback action: ${action}`);
  return { ...state, feedback: [...state.feedback, { contentId, action, createdAt: new Date().toISOString() }] };
}

const SUGGESTION_CATALOG = Object.freeze([
  { name: 'Game criticism', category: 'topic', reason: 'A natural companion to creator-focused gaming interests.', triggers: ['creator', 'game', 'gaming', 'nuxinor', 'luke stephens', 'asmongold'] },
  { name: 'RPGs', category: 'game', reason: 'A broad game lane worth exploring.', triggers: ['game', 'gaming', 'rpg'] },
  { name: 'Streaming culture', category: 'topic', reason: 'Connects creator interests with the wider online ecosystem.', triggers: ['creator', 'stream', 'asmongold'] },
  { name: 'Artificial intelligence', category: 'topic', reason: 'A high-leverage topic for a personal information hub.', triggers: ['technology', 'software', 'ai', 'creative tools'] },
  { name: 'Software development', category: 'topic', reason: 'Useful alongside a software project and technology interests.', triggers: ['technology', 'software', 'developer', 'saberdueler'] },
  { name: 'Art education', category: 'topic', reason: 'Connects to your professional GMCHE art class project.', triggers: ['art', 'teaching', 'education', 'gmche'] },
  { name: 'Game design', category: 'topic', reason: 'A useful bridge between SaberDueler and your media interests.', triggers: ['game', 'saberdueler', 'design'] },
  { name: 'Indie games', category: 'game', reason: 'A focused discovery lane with lots of variety.', triggers: ['game', 'gaming', 'indie'] },
]);

export function suggestInterestCandidates(interests) {
  const existing = interests.map((interest) => normalise(interest.name));
  const sourceText = interests.map((interest) => `${interest.name} ${interest.category}`).join(' ').toLocaleLowerCase();
  return SUGGESTION_CATALOG.filter((candidate) => !existing.includes(normalise(candidate.name)) && candidate.triggers.some((trigger) => sourceText.includes(trigger))).slice(0, 6);
}
