import { APP_CONFIG } from './config.js';

const normalise = (value) => String(value || '').trim().toLocaleLowerCase();

const CATALOG = Object.freeze([
  { name: 'MrBeast', category: 'creator', tags: ['entertainment', 'challenge', 'philanthropy'], popularity: 5, rating: 5 },
  { name: 'Mark Rober', category: 'creator', tags: ['science', 'engineering', 'entertainment'], popularity: 5, rating: 5 },
  { name: 'Marques Brownlee', category: 'creator', tags: ['technology', 'reviews', 'hardware'], popularity: 5, rating: 5 },
  { name: 'PewDiePie', category: 'creator', tags: ['gaming', 'commentary', 'horror'], popularity: 5, rating: 5 },
  { name: 'Linus Tech Tips', category: 'creator', tags: ['technology', 'hardware', 'reviews'], popularity: 5, rating: 5 },
  { name: 'Nuxinor', category: 'creator', tags: ['gaming', 'commentary', 'action rpg'], popularity: 5, rating: 5 },
  { name: 'Luke Stephens', category: 'creator', tags: ['gaming', 'game criticism', 'rpg', 'indie'], popularity: 5, rating: 5 },
  { name: 'Asmongold', category: 'creator', tags: ['gaming', 'rpg', 'mmorpg', 'commentary'], popularity: 5, rating: 5 },
  { name: 'Ludwig', category: 'creator', tags: ['gaming', 'entertainment', 'streaming'], popularity: 4, rating: 4 },
  { name: 'MoistCr1TiKaL', category: 'creator', tags: ['commentary', 'gaming', 'entertainment'], popularity: 4, rating: 4 },
  { name: 'Minecraft', category: 'game', tags: ['sandbox', 'survival', 'creative'], popularity: 5, rating: 4 },
  { name: 'Fortnite', category: 'game', tags: ['competitive', 'shooter', 'live service'], popularity: 5, rating: 3 },
  { name: 'Call of Duty', category: 'game', tags: ['competitive', 'shooter', 'action'], popularity: 5, rating: 3 },
  { name: 'Grand Theft Auto V', category: 'game', tags: ['open world', 'action', 'story'], popularity: 5, rating: 3 },
  { name: 'Roblox', category: 'game', tags: ['sandbox', 'social', 'creative'], popularity: 5, rating: 3 },
  { name: 'League of Legends', category: 'game', tags: ['competitive', 'strategy', 'moba'], popularity: 4, rating: 3 },
  { name: 'Valorant', category: 'game', tags: ['competitive', 'shooter', 'tactical'], popularity: 4, rating: 3 },
  { name: 'Elden Ring', category: 'game', tags: ['action rpg', 'open world', 'rpg'], popularity: 4, rating: 4 },
  { name: 'Baldur’s Gate 3', category: 'game', tags: ['rpg', 'story', 'strategy'], popularity: 4, rating: 4 },
  { name: 'Stardew Valley', category: 'game', tags: ['indie', 'cozy', 'simulation'], popularity: 4, rating: 4 },
  { name: 'Artificial intelligence', category: 'topic', tags: ['technology', 'software', 'creative tools'], popularity: 5, rating: 3 },
  { name: 'Software development', category: 'topic', tags: ['technology', 'software', 'programming'], popularity: 5, rating: 3 },
  { name: 'Creative tools', category: 'topic', tags: ['technology', 'design', 'art'], popularity: 4, rating: 3 },
  { name: 'Movies', category: 'topic', tags: ['entertainment', 'story'], popularity: 4, rating: 3 },
  { name: 'TV', category: 'topic', tags: ['entertainment', 'story'], popularity: 4, rating: 3 },
  { name: 'Anime', category: 'topic', tags: ['entertainment', 'story', 'art'], popularity: 4, rating: 3 },
  { name: 'Music', category: 'topic', tags: ['entertainment', 'creative'], popularity: 4, rating: 3 },
  { name: 'Teaching', category: 'topic', tags: ['professional', 'education', 'communication'], popularity: 4, rating: 3 },
  { name: 'Art education', category: 'topic', tags: ['professional', 'education', 'art'], popularity: 5, rating: 3 },
  { name: 'Design', category: 'topic', tags: ['professional', 'creative', 'art'], popularity: 4, rating: 3 },
  { name: 'Small business', category: 'topic', tags: ['professional', 'planning', 'business'], popularity: 3, rating: 3 },
]);

const ONBOARDING_BLUEPRINT = Object.freeze([
  { id: 'creators', title: 'Creators you enjoy', category: 'creator', fallbackPrompt: 'Start with a few public voices. Your choices will shape the next questions.' },
  { id: 'gaming', title: 'Gaming', category: 'game', fallbackPrompt: 'Pick games that belong in your signal.' },
  { id: 'technology', title: 'Technology & AI', category: 'topic', fallbackPrompt: 'Choose the technology lanes worth your attention.' },
  { id: 'entertainment', title: 'Entertainment', category: 'topic', fallbackPrompt: 'Add a little signal to your downtime.' },
  { id: 'professional', title: 'Professional interests', category: 'topic', fallbackPrompt: 'Choose the interests that help your work grow.' },
]);

function tokenSet(values) {
  return new Set(values.flatMap((value) => normalise(value).split(/[^a-z0-9]+/).filter(Boolean)));
}

function selectedNames(selections) {
  return Object.entries(selections).filter(([, selected]) => selected).map(([name]) => name);
}

function relatedSignals(interests, selections) {
  const selected = selectedNames(selections);
  const contextNames = [...interests.map((interest) => interest.name), ...selected];
  const selectedCatalogTags = CATALOG.filter((entry) => contextNames.some((name) => normalise(name) === normalise(entry.name))).flatMap((entry) => entry.tags);
  return tokenSet([
    ...interests.map((interest) => interest.name),
    ...interests.map((interest) => interest.category),
    ...selected,
    ...selectedCatalogTags,
  ]);
}

function hasSignalOverlap(tag, signals) {
  return normalise(tag).split(/[^a-z0-9]+/).filter(Boolean).some((token) => signals.has(token));
}

export function recommendOnboardingOptions(category, interests = [], selections = {}) {
  const signals = relatedSignals(interests, selections);
  const selected = selectedNames(selections);
  const existing = interests.filter((interest) => interest.category === category).map((interest) => interest.name);
  const categoryEntries = CATALOG.filter((entry) => entry.category === category);
  const ranked = categoryEntries
    .map((entry, order) => ({ ...entry, order, score: entry.popularity * APP_CONFIG.onboardingPopularityWeight + entry.tags.filter((tag) => hasSignalOverlap(tag, signals)).length * APP_CONFIG.onboardingMatchBonus }))
    .sort((left, right) => right.score - left.score || left.order - right.order);
  const pinned = [...existing, ...selected].filter((name, index, names) => names.findIndex((item) => normalise(item) === normalise(name)) === index);
  const names = [...pinned, ...ranked.map((entry) => entry.name)].filter((name, index, all) => all.findIndex((item) => normalise(item) === normalise(name)) === index);
  return names.slice(0, APP_CONFIG.onboardingOptionLimit);
}

export function getOnboardingSteps({ interests = [], selections = {} } = {}) {
  const chosenCreators = selectedNames(selections).filter((name) => CATALOG.some((entry) => entry.category === 'creator' && normalise(entry.name) === normalise(name)));
  return ONBOARDING_BLUEPRINT.map((step) => {
    const options = recommendOnboardingOptions(step.category, interests, selections);
    const prompt = step.id === 'gaming' && chosenCreators.length
      ? `Because you chose ${chosenCreators.join(', ')}, these games may fit your signal.`
      : step.fallbackPrompt;
    return { ...step, prompt, options };
  });
}

export function onboardingRating(name, category) {
  return CATALOG.find((entry) => entry.category === category && normalise(entry.name) === normalise(name))?.rating
    || (category === 'creator' ? APP_CONFIG.onboardingDefaultCreatorRating : APP_CONFIG.onboardingDefaultRating);
}
