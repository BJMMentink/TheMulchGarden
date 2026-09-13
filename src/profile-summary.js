import { APP_CONFIG } from './config.js';

const CATEGORY_LABELS = Object.freeze({ creator: 'creators', game: 'games', topic: 'topics', keyword: 'everyday interests' });

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function describeGroup(interests, fallback) {
  if (!interests.length) return fallback;
  const names = interests.map((interest) => interest.name);
  const categories = [...new Set(interests.map((interest) => CATEGORY_LABELS[interest.category] || 'interests'))];
  return `${joinNames(names)}${categories.length ? ` (${joinNames(categories)})` : ''}`;
}

export function summarizePreferences(interests = []) {
  const usable = Array.isArray(interests) ? interests.filter((interest) => interest?.name) : [];
  const sorted = [...usable].sort((left, right) => Number(right.rating || 0) - Number(left.rating || 0));
  const liked = sorted.filter((interest) => Number(interest.rating) >= 4).slice(0, APP_CONFIG.profileSummaryNameLimit);
  const disliked = [...usable].sort((left, right) => Number(left.rating || 0) - Number(right.rating || 0)).filter((interest) => Number(interest.rating) <= 2).slice(0, APP_CONFIG.profileSummaryNameLimit);
  const exploring = sorted.filter((interest) => Number(interest.rating) === 3).slice(0, APP_CONFIG.profileSummaryNameLimit);

  if (!usable.length) return { text: 'The garden does not know much yet. Play Get to know me or add a few interests to begin.', likes: [], dislikes: [], exploring: [] };

  const parts = [`You currently seem drawn to ${describeGroup(liked, 'a few different things')}.`];
  parts.push(disliked.length ? `You seem less interested in ${describeGroup(disliked, 'some areas')}.` : 'No clear dislikes are saved yet.');
  if (exploring.length) parts.push(`You are still exploring ${describeGroup(exploring, 'some possibilities')}.`);
  return { text: parts.join(' '), likes: liked.map((interest) => interest.name), dislikes: disliked.map((interest) => interest.name), exploring: exploring.map((interest) => interest.name) };
}
