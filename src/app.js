import { APP_CONFIG, INTEREST_CATEGORIES, SECTIONS } from './config.js';
import { createInterest, suggestInterestCandidates } from './interest-engine.js';
import { findNewChatMessages, shouldShowChatTimestamp } from './chat-engine.js';
import { createGetToKnowMeState, getCurrentQuestion, getGameTheme, recordAnswer, startRound } from './get-to-know-me.js';
import { createWordleState, getDailyAnswer, getWordleDate, resetWordleForDate, submitWordleGuess } from './wordle.js';
import { summarizePreferences } from './profile-summary.js';
import { createTodo, filterTodos, normalizeTags, normalizeTodo, TODO_ASSIGNMENT_EVERYONE } from './todo-engine.js';
import { getCurrentUser, loadChatMessages, loadDailyWordle, loadMembers, loadState, login, logout, saveState, sendChatMessage, updateAccount } from './storage.js';

let state;
let currentUser;
let members = [];
let chatMessages = [];
let chatOpen = false;
let chatUnreadCount = 0;
let chatPollTimer;
let dailyWordle = { date: getWordleDate(), answer: getDailyAnswer() };
let todoFilters = { query: '', status: 'open', assignedTo: 'all' };
let selectedSection = APP_CONFIG.defaultSection;
let activeGame = null;
let guestMode = false;
let authDarkMode = true;
let authLoginOpen = false;
let authKeyHandler;
let scrollIdleTimer;
let scrollIndicatorBound = false;
let scrollIndicatorThumb;
let scrollIndicatorFrame;
let heroIntroGestureBound = false;
let heroIntroConsumed = false;
let heroIntroResetting = false;
let heroIntroResetTimer;
let heroIntroReady = false;
let heroIntroInitialFull = false;
let heroTouchStartY;
let boardRepoCache = Object.create(null);
let boardFilters = { query: '', folder: 'all', language: 'all', topic: 'all', owner: 'all' };
const root = document.querySelector('#app');

function applyPerformanceProfile() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const lowPower = (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= APP_CONFIG.performance.lowPowerCoreLimit)
    || (navigator.deviceMemory > 0 && navigator.deviceMemory <= APP_CONFIG.performance.lowPowerMemoryGb)
    || Boolean(connection?.saveData)
    || APP_CONFIG.performance.lowPowerNetworkTypes.includes(connection?.effectiveType);
  document.documentElement.classList.toggle('is-low-power', lowPower);
}

function bindScrollIndicator() {
  if (scrollIndicatorBound) return;
  scrollIndicatorBound = true;
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  const indicator = document.createElement('span');
  indicator.className = 'scroll-indicator';
  scrollIndicatorThumb = document.createElement('span');
  scrollIndicatorThumb.className = 'scroll-indicator-thumb';
  indicator.append(scrollIndicatorThumb);
  document.body.append(indicator);
  const updateIndicator = () => {
    const documentHeight = document.documentElement.scrollHeight;
    const viewportHeight = window.innerHeight;
    const scrollableHeight = Math.max(1, documentHeight - viewportHeight);
    const thumbHeight = Math.max(40, Math.round((viewportHeight / documentHeight) * viewportHeight));
    const maxTop = Math.max(0, viewportHeight - thumbHeight);
    const top = Math.round((window.scrollY / scrollableHeight) * maxTop);
    const landingView = root.dataset.minimalView === 'landing';
    if (landingView && heroIntroInitialFull && window.scrollY > 8) heroIntroInitialFull = false;
    if (landingView && heroIntroConsumed && !heroIntroInitialFull && !heroIntroResetting && window.scrollY <= 8 && document.querySelector('.editorial-hero')) {
      heroIntroConsumed = false;
      heroIntroResetting = true;
      window.clearTimeout(heroIntroResetTimer);
      heroIntroResetTimer = window.setTimeout(() => {
        heroIntroResetting = false;
        scheduleIndicatorUpdate();
      }, APP_CONFIG.performance.heroIntroResetMs);
    }
    const heroHasSettled = landingView && heroIntroConsumed && document.querySelector('.editorial-hero');
    const nonLandingPage = root.dataset.minimalView && !landingView;
    document.documentElement.classList.toggle('is-away-from-top', window.scrollY > 8 || Boolean(heroHasSettled) || Boolean(nonLandingPage));
    scrollIndicatorThumb.style.height = `${thumbHeight}px`;
    scrollIndicatorThumb.style.transform = `translateY(${top}px)`;
  };
  const scheduleIndicatorUpdate = () => {
    if (scrollIndicatorFrame) return;
    scrollIndicatorFrame = window.requestAnimationFrame(() => {
      scrollIndicatorFrame = undefined;
      updateIndicator();
      if (heroIntroReady && !heroIntroResetting && root.dataset.minimalView === 'landing') updateHeroIntroScale();
    });
  };
  window.addEventListener('scroll', () => {
    if (root.dataset.minimalView && root.dataset.minimalView !== 'landing') {
      scheduleIndicatorUpdate();
      document.documentElement.classList.add('is-scrolling');
      window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(() => document.documentElement.classList.remove('is-scrolling'), APP_CONFIG.performance.scrollIndicatorFadeMs);
      return;
    }
    if (!heroIntroReady) {
      if (window.scrollY > 8) window.scrollTo({ top: 0, behavior: 'auto' });
      scheduleIndicatorUpdate();
      return;
    }
    if (!heroIntroConsumed && window.scrollY > 8 && document.querySelector('.editorial-hero')) {
      settleHeroIntro(true);
      return;
    }
    scheduleIndicatorUpdate();
    document.documentElement.classList.add('is-scrolling');
    window.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = window.setTimeout(() => document.documentElement.classList.remove('is-scrolling'), APP_CONFIG.performance.scrollIndicatorFadeMs);
  }, { passive: true });
  window.addEventListener('resize', scheduleIndicatorUpdate, { passive: true });
  updateIndicator();
}

function updateHeroIntroScale() {
  const hero = document.querySelector('.editorial-hero');
  if (root.dataset.minimalView !== 'landing' || !hero || document.documentElement.classList.contains('is-away-from-top') || !hero.offsetWidth) return;
  const rect = hero.getBoundingClientRect();
  const rootStyle = getComputedStyle(document.documentElement);
  const baseScale = window.matchMedia('(max-width: 37.99rem)').matches ? 0.975 : 0.965;
  const currentHorizontalScale = Number(rootStyle.getPropertyValue('--hero-intro-scale-x')) || baseScale;
  const currentVerticalScale = Number(rootStyle.getPropertyValue('--hero-intro-scale-y')) || baseScale;
  const verticalInset = Math.max(0, Math.min(rect.top, window.innerHeight - rect.bottom));
  const horizontalInset = Math.max(0, Math.min(rect.left, window.innerWidth - rect.right));
  const desiredInset = APP_CONFIG.performance.heroIntroInsetPx;
  const verticalScale = Math.max(0.9, Math.min(1, currentVerticalScale + ((verticalInset - desiredInset) * 2 / hero.offsetHeight)));
  const horizontalScale = Math.max(0.9, Math.min(1, currentHorizontalScale + ((horizontalInset - desiredInset) * 2 / hero.offsetWidth)));
  document.documentElement.style.setProperty('--hero-intro-scale-x', horizontalScale.toFixed(4));
  document.documentElement.style.setProperty('--hero-intro-scale-y', verticalScale.toFixed(4));
}

function settleHeroIntro(resetScroll = false) {
  if (root.dataset.minimalView !== 'landing' || heroIntroConsumed || (!resetScroll && window.scrollY > 8) || !document.querySelector('.editorial-hero')) return false;
  heroIntroConsumed = true;
  if (resetScroll) {
    heroIntroResetting = true;
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.clearTimeout(heroIntroResetTimer);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => { heroIntroResetting = false; }));
  }
  document.documentElement.classList.add('is-away-from-top', 'is-scrolling');
  window.clearTimeout(scrollIdleTimer);
  scrollIdleTimer = window.setTimeout(() => document.documentElement.classList.remove('is-scrolling'), APP_CONFIG.performance.scrollIndicatorFadeMs);
  return true;
}

function restoreHeroIntro() {
  if (root.dataset.minimalView !== 'landing' || !heroIntroConsumed || window.scrollY > 8 || !document.querySelector('.editorial-hero')) return false;
  heroIntroConsumed = false;
  heroIntroInitialFull = false;
  heroIntroResetting = true;
  window.clearTimeout(heroIntroResetTimer);
  heroIntroResetTimer = window.setTimeout(() => {
    heroIntroResetting = false;
    updateHeroIntroScale();
  }, APP_CONFIG.performance.heroIntroResetMs);
  document.documentElement.classList.remove('is-away-from-top');
  document.documentElement.classList.add('is-scrolling');
  window.clearTimeout(scrollIdleTimer);
  scrollIdleTimer = window.setTimeout(() => document.documentElement.classList.remove('is-scrolling'), APP_CONFIG.performance.scrollIndicatorFadeMs);
  return true;
}

function bindHeroIntroGesture() {
  if (heroIntroGestureBound) return;
  heroIntroGestureBound = true;
  window.addEventListener('wheel', (event) => {
    if (event.ctrlKey || !event.cancelable) return;
    if (event.deltaY < 0) {
      if (restoreHeroIntro()) event.preventDefault();
      return;
    }
    if (event.deltaY === 0) return;
    if (settleHeroIntro()) event.preventDefault();
  }, { passive: false });
  window.addEventListener('touchstart', (event) => { heroTouchStartY = event.touches[0]?.clientY; }, { passive: true });
  window.addEventListener('touchmove', (event) => {
    const currentY = event.touches[0]?.clientY;
    const deltaY = heroTouchStartY === undefined || currentY === undefined ? 0 : heroTouchStartY - currentY;
    if (!deltaY || !event.cancelable) return;
    if ((deltaY < -8 && restoreHeroIntro()) || (deltaY >= 8 && settleHeroIntro())) {
      event.preventDefault();
      heroTouchStartY = undefined;
    }
  }, { passive: false });
  window.addEventListener('touchend', () => { heroTouchStartY = undefined; }, { passive: true });
  window.addEventListener('keydown', (event) => {
    const activeElement = document.activeElement;
    if (activeElement?.matches('input, textarea, select, button, a, [contenteditable="true"]')) return;
    if (event.key === 'ArrowUp' || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)) {
      if (restoreHeroIntro()) event.preventDefault();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'PageDown' && event.key !== ' ') return;
    if (settleHeroIntro()) event.preventDefault();
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character]);
}

function stars(rating) {
  return Array.from({ length: APP_CONFIG.maxInterestRating }, (_, index) => index < rating ? '★' : '☆').join('');
}

function activeSection() {
  return selectedSection;
}

function setSection(section) {
  selectedSection = section;
  document.querySelectorAll('[data-section]').forEach((element) => element.classList.toggle('is-active', element.dataset.section === section));
  document.querySelectorAll('[data-view]').forEach((element) => element.hidden = element.dataset.view !== section);
  document.querySelectorAll('[data-nav]').forEach((element) => element.classList.toggle('is-selected', element.dataset.nav === section));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function visibleSections() {
  return SECTIONS;
}

function todoMembers() {
  return [...members, { id: TODO_ASSIGNMENT_EVERYONE, username: 'Everyone' }];
}

function memberName(id) {
  if (id === 'system') return 'Garden';
  return todoMembers().find((member) => member.id === id)?.username || 'Unknown';
}

function memberOptions(selected = TODO_ASSIGNMENT_EVERYONE) {
  return todoMembers().map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === selected ? 'selected' : ''}>${escapeHtml(member.username)}</option>`).join('');
}

function interestCards() {
  return state.interests.map((interest) => `<article class="interest-card card"><div><span class="eyebrow">${escapeHtml(interest.category)}</span><h3>${escapeHtml(interest.name)}</h3><div class="interest-actions"><button class="text-button" data-edit-interest="${interest.id}">Edit</button><button class="text-button danger" data-remove-interest="${interest.id}">Remove</button></div></div><div class="rating" aria-label="${interest.rating} out of 5">${stars(interest.rating)}</div></article>`).join('');
}

function suggestionCards() {
  const suggestions = suggestInterestCandidates(state.interests);
  if (!suggestions.length) return '<article class="card empty-state"><h3>Your map is broad for now.</h3><p>Add another interest and the engine will look for new connections.</p></article>';
  return suggestions.map((suggestion) => `<article class="suggestion-card card"><div><span class="eyebrow">${escapeHtml(suggestion.category)}</span><h3>${escapeHtml(suggestion.name)}</h3><p>${escapeHtml(suggestion.reason)}</p></div><button class="button button-quiet" data-add-suggestion="${escapeHtml(suggestion.name)}" data-suggestion-category="${suggestion.category}">Add</button></article>`).join('');
}

function getToKnowMeView() {
  const game = state.games.getToKnowMe;
  const theme = getGameTheme(state.interests);
  const themeSummary = `<div class="game-theme-summary"><span class="eyebrow">Current tone</span><strong>${escapeHtml(theme.label)}</strong><p>${escapeHtml(theme.description)}</p></div>`;
  if (!game.currentRound || !game.roundQuestionIds.length) return `<article class="card game-intro game-theme-${theme.id}"><span class="card-icon">◇</span><div><span class="eyebrow">First game</span><h3>Get to know me</h3><p>Play twenty quick questions. Your likes and dislikes become editable Interest Engine signals that make future rounds more personal.</p>${themeSummary}<button class="button" data-action="start-game">Start round one</button></div></article>`;
  const question = getCurrentQuestion(game);
  if (!question) return `<article class="card game-complete game-theme-${theme.id}"><span class="eyebrow">Round ${game.currentRound} complete</span><h3>You gave the garden more signal.</h3><p>Your answers are saved. Start another round later for a different set of questions shaped by what you have already shared.</p>${themeSummary}<button class="button" data-action="start-game">Start another round</button></article>`;
  const answeredCount = game.questionIndex;
  return `<article class="card game-card game-theme-${theme.id}"><div class="game-progress"><div class="form-heading"><span class="eyebrow">Round ${game.currentRound} · ${escapeHtml(theme.label)}</span><span class="eyebrow">Question ${answeredCount + 1} of ${APP_CONFIG.getToKnowMeQuestionCount}</span></div><div class="progress-line"><span style="width: ${(answeredCount / APP_CONFIG.getToKnowMeQuestionCount) * 100}%"></span></div></div><span class="eyebrow">What do you think?</span><h3>${escapeHtml(question.prompt)}</h3><div class="answer-grid">${question.options.map((option) => `<button class="answer-choice" data-game-answer="${escapeHtml(option.id)}">${escapeHtml(option.label)}</button>`).join('')}</div><p class="game-note">Your answer updates your editable interests. You can change or remove anything later.</p></article>`;
}

function wordleView() {
  const game = state.games.wordle;
  const answer = game.date === dailyWordle.date ? dailyWordle.answer : getDailyAnswer(new Date(`${game.date}T00:00:00Z`));
  const rows = Array.from({ length: APP_CONFIG.wordleMaxGuesses }, (_, index) => {
    const guess = game.guesses[index];
    return `<div class="wordle-row">${Array.from({ length: APP_CONFIG.wordleWordLength }, (_, letterIndex) => guess ? `<span class="wordle-cell is-${guess.result[letterIndex]}">${guess.word[letterIndex]}</span>` : '<span class="wordle-cell"></span>').join('')}</div>`;
  }).join('');
  const message = game.status === 'won' ? 'Solved. The next puzzle arrives tomorrow.' : game.status === 'lost' ? `The word was ${answer}. Come back tomorrow for a new puzzle.` : 'Guess the five-letter word in six tries.';
  const shareButton = game.status === 'playing' ? '' : '<button class="button button-quiet" data-action="share-wordle">Share result to garden chat</button>';
  return `<article class="card game-card wordle-card"><div class="form-heading"><div><span class="eyebrow">Daily game · ${escapeHtml(game.date)}</span><h3>Daily Wordle</h3></div><span class="wordle-status ${game.status}">${game.guesses.length}/${APP_CONFIG.wordleMaxGuesses}</span></div><p>${message}</p><p class="wordle-attempts">Attempts used: <strong>${game.guesses.length}</strong> · Attempts remaining: <strong>${Math.max(0, APP_CONFIG.wordleMaxGuesses - game.guesses.length)}</strong></p><div class="wordle-board" aria-label="Daily Wordle board">${rows}</div>${game.status === 'playing' ? `<form class="wordle-form" id="wordle-form"><label class="sr-only" for="wordle-guess">Your five-letter guess</label><input id="wordle-guess" name="guess" required minlength="${APP_CONFIG.wordleWordLength}" maxlength="${APP_CONFIG.wordleWordLength}" pattern="[A-Za-z]{${APP_CONFIG.wordleWordLength}}" autocomplete="off" autocapitalize="characters" placeholder="GUESS"><button class="button" type="submit">Try</button></form>` : `<div class="wordle-actions">${shareButton}</div>`}<div class="wordle-legend"><span><i class="is-correct"></i>Right place</span><span><i class="is-present"></i>Wrong place</span><span><i class="is-absent"></i>Not in word</span></div></article>`;
}

function wordleShareText() {
  const game = state.games.wordle;
  const squares = game.guesses.map((guess) => guess.result.map((result) => result === 'correct' ? '🟩' : result === 'present' ? '🟨' : '⬛').join('')).join('\n');
  return `Daily Wordle ${game.date} ${game.status === 'won' ? `${game.guesses.length}/${APP_CONFIG.wordleMaxGuesses}` : `X/${APP_CONFIG.wordleMaxGuesses}`}\n${squares}`;
}

function gameTile(id, icon, title, description) {
  return `<button class="game-tile card" data-open-game="${id}"><span class="game-tile-icon" aria-hidden="true">${icon}</span><span class="game-tile-copy"><strong>${title}</strong><small>${description}</small></span><span class="game-tile-arrow" aria-hidden="true">↗</span></button>`;
}

function gamesView() {
  const overlay = activeGame ? `<div class="game-overlay"><div class="game-overlay-topline"><span class="eyebrow">Games</span><button class="button button-quiet" data-action="close-game">Back to games</button></div><div class="game-overlay-content">${activeGame === 'wordle' ? wordleView() : getToKnowMeView()}</div></div>` : '';
  return `<div class="section-heading"><div><span class="eyebrow">Games</span><h2>Learn by playing.</h2><p>Small games can help the garden understand what you enjoy, one answer at a time.</p></div></div><div class="games-launcher">${gameTile('get-to-know-me', '◇', 'Get to know me', 'Twenty questions shaped by your interests')}${gameTile('wordle', '▦', 'Daily Wordle', `${state.games.wordle.guesses.length}/${APP_CONFIG.wordleMaxGuesses} attempts used today`)}</div>${overlay}`;
}

function applyGameAnswer(answer) {
  const existing = state.interests.find((interest) => interest.category === answer.category && interest.name.toLocaleLowerCase() === answer.interestName.toLocaleLowerCase());
  if (existing) {
    existing.rating = answer.rating;
    existing.source = 'game';
    existing.updatedAt = answer.createdAt;
    return;
  }
  state.interests.push(createInterest({ name: answer.interestName, category: answer.category, rating: answer.rating, source: 'game' }));
}

function shouldShowChatTime(index) {
  return shouldShowChatTimestamp(chatMessages, index, APP_CONFIG.chatTimestampGapMs);
}

function formatChatTime(createdAt) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function chatMessagesView() {
  if (!chatMessages.length) return '<p class="chat-empty">No messages yet.</p>';
  return chatMessages.map((message, index) => `<div class="chat-message"><div><strong>${escapeHtml(message.username)}</strong><span>: ${escapeHtml(message.message)}</span></div>${shouldShowChatTime(index) ? `<time class="chat-time" datetime="${escapeHtml(message.createdAt)}">${escapeHtml(formatChatTime(message.createdAt))}</time>` : ''}</div>`).join('');
}

function globalChatView() {
  const badge = chatUnreadCount ? `<span class="chat-badge" aria-label="${chatUnreadCount} unread message${chatUnreadCount === 1 ? '' : 's'}">${chatUnreadCount > 9 ? '9+' : chatUnreadCount}</span>` : '';
  return `<aside class="global-chat ${chatOpen ? 'is-open' : ''}">${chatOpen ? `<section class="chat-popover card" aria-label="Global chat"><div class="chat-heading"><div><span class="eyebrow">Shared space</span><h2>Garden chat</h2></div><button class="icon-button" data-action="toggle-chat" aria-label="Close chat">×</button></div><div class="chat-messages" aria-live="polite">${chatMessagesView()}</div><form class="chat-form" id="chat-form"><input name="message" required maxlength="${APP_CONFIG.chatMaxMessageLength}" placeholder="Write a message" autocomplete="off"><button class="button" type="submit">Send</button></form></section>` : ''}<button class="chat-launcher button" data-action="toggle-chat" aria-expanded="${chatOpen}">${chatOpen ? 'Hide chat' : 'Chat'}${badge}</button></aside>`;
}

async function refreshChat() {
  if (!currentUser) return;
  try {
    const nextMessages = await loadChatMessages();
    if (Array.isArray(nextMessages)) {
      const newMessages = findNewChatMessages(chatMessages, nextMessages);
      chatMessages = nextMessages.slice(-APP_CONFIG.chatMaxMessages);
      const incomingMessages = newMessages.filter((message) => message.userId !== currentUser.id && message.username !== currentUser.username);
      if (chatOpen) chatUnreadCount = 0;
      else chatUnreadCount += incomingMessages.length;
      if (newMessages.length) { const section = activeSection(); render(); setSection(section); }
    }
  } catch { /* The dashboard remains usable if chat is temporarily unavailable. */ }
}

function startChatPolling() {
  clearInterval(chatPollTimer);
}

function memoryCards() {
  if (!state.memories.length) return '<p class="empty-copy">No saved memories yet. Add only what you want the future assistant to know.</p>';
  return state.memories.map((memory) => `<div class="memory-row"><textarea data-memory-input="${memory.id}" maxlength="500">${escapeHtml(memory.text)}</textarea><div class="memory-actions"><button class="button button-quiet" data-save-memory="${memory.id}">Save</button><button class="text-button danger" data-remove-memory="${memory.id}">Delete</button></div></div>`).join('');
}

function projectCards() {
  return state.projects.map((project) => {
    const projectTodos = state.todos.filter((todo) => todo.projectId === project.id);
    const openTodos = projectTodos.filter((todo) => !todo.done).length;
    return `<article class="project-card card"><div class="project-heading"><div><span class="project-dot ${project.color}"></span><span class="eyebrow">${escapeHtml(project.type)}</span><h3>${escapeHtml(project.name)}</h3></div><span class="count-badge">${openTodos} open</span></div><div class="todo-list">${projectTodos.map((todo) => `<label class="todo-row"><span class="todo-toggle"><input type="checkbox" data-todo="${todo.id}" data-project="${project.id}" aria-label="Mark ${escapeHtml(todo.title)} complete" ${todo.done ? 'checked' : ''}><span class="todo-toggle-track" aria-hidden="true"><span class="todo-toggle-thumb"></span></span></span><span class="${todo.done ? 'done' : ''}">${escapeHtml(todo.title)}</span></label>`).join('')}</div><form class="inline-form" data-add-todo="${project.id}"><input name="title" maxlength="${APP_CONFIG.maxTodoTitleLength}" placeholder="Add a task" aria-label="Add task to ${escapeHtml(project.name)}"><button class="button button-quiet" type="submit">Add</button></form></article>`;
  }).join('');
}

function todoCards() {
  const todos = filterTodos(state.todos, todoFilters);
  if (!todos.length) return '<article class="card empty-state"><h3>No todos match this view.</h3><p>Try another filter or add a new shared task above.</p></article>';
  return todos.map((todo) => {
    const project = state.projects.find((item) => item.id === todo.projectId);
    return `<article class="todo-card card ${todo.done ? 'is-complete' : ''}"><div class="todo-card-main"><label class="todo-check"><span class="todo-toggle"><input type="checkbox" data-todo="${escapeHtml(todo.id)}" aria-label="Mark ${escapeHtml(todo.title)} complete" ${todo.done ? 'checked' : ''}><span class="todo-toggle-track" aria-hidden="true"><span class="todo-toggle-thumb"></span></span></span><span class="${todo.done ? 'done' : ''}">${escapeHtml(todo.title)}</span></label><div class="todo-detail-row">${project ? `<span class="todo-project">${escapeHtml(project.name)}</span>` : '<span class="todo-project">No project</span>'}${todo.tags.map((tag) => `<span class="todo-tag">${escapeHtml(tag)}</span>`).join('')}</div><div class="todo-people"><span class="person-tag">Added by ${escapeHtml(memberName(todo.addedBy))}</span><span class="person-tag">For ${escapeHtml(memberName(todo.assignedTo))}</span></div></div><div class="todo-actions"><button class="text-button" data-edit-todo="${escapeHtml(todo.id)}">Edit</button><button class="text-button danger" data-remove-todo="${escapeHtml(todo.id)}">Delete</button></div></article>`;
  }).join('');
}

function render() {
  const sections = visibleSections();
  const section = sections.some((item) => item.id === activeSection()) ? activeSection() : APP_CONFIG.defaultSection;
  root.innerHTML = `<header class="topbar"><div><p class="eyebrow">${escapeHtml(currentUser.username)} · Personal command center</p><h1>The Mulch Garden</h1></div><div class="topbar-actions"><button class="text-button" data-action="account">Account</button><button class="text-button" data-action="logout">Log out</button></div></header>
      <main class="page-shell">
    <section data-view="dashboard" class="view"><div class="welcome-panel card"><div><span class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span><h2>Tend what matters today.</h2><p>Your small, local-first hub for projects, attention, and a little signal.</p></div><div class="garden-mark" aria-hidden="true">✿</div></div><div class="section-heading"><div><span class="eyebrow">Today</span><h2>Good soil for a start</h2></div></div><div class="briefing-grid"><article class="card briefing-card"><span class="card-icon">✓</span><div><span class="eyebrow">Open work</span><strong>${state.todos.filter((todo) => !todo.done).length} tasks</strong><p>Keep the next action visible.</p></div></article><article class="card briefing-card"><span class="card-icon">✦</span><div><span class="eyebrow">Attention</span><strong>${state.interests.length} interests</strong><p>Weighted by what you care about.</p></div></article></div><article class="card next-step"><div><span class="eyebrow">Suggested next step</span><h3>Grow your interest map</h3><p>Add a creator, topic, game, or keyword. Ratings help the engine prioritize future content.</p></div><button class="button" data-nav="interests">Review interests</button></article></section>
    <section data-view="todos" class="view" hidden><div class="section-heading"><div><span class="eyebrow">Shared todos</span><h2>What needs tending?</h2><p>Everyone can see the same list. Each task keeps its author and intended person visible.</p></div></div><form class="card todo-composer" id="todo-form"><div class="form-heading"><h3>Add a shared todo</h3><span class="eyebrow">Added by ${escapeHtml(currentUser.username)}</span></div><label>Task<input name="title" required maxlength="${APP_CONFIG.maxTodoTitleLength}" placeholder="What needs doing?" autocomplete="off"></label><div class="todo-form-fields"><label>Tags<input name="tags" maxlength="${APP_CONFIG.maxTodoTags * APP_CONFIG.maxTodoTagLength}" placeholder="home, urgent"></label><label>Project<select name="projectId"><option value="">No project</option>${state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join('')}</select></label><label>For<select name="assignedTo">${memberOptions()}</select></label></div><button class="button" type="submit">Add todo</button></form><div class="todo-toolbar card"><label>Search<input data-todo-filter="query" value="${escapeHtml(todoFilters.query)}" placeholder="Search todos or tags"></label><label>Status<select data-todo-filter="status"><option value="open" ${todoFilters.status === 'open' ? 'selected' : ''}>Open</option><option value="all" ${todoFilters.status === 'all' ? 'selected' : ''}>All</option><option value="completed" ${todoFilters.status === 'completed' ? 'selected' : ''}>Completed</option></select></label><label>Assigned to<select data-todo-filter="assignedTo"><option value="all">Everyone / anyone</option>${memberOptions(todoFilters.assignedTo)}</select></label></div><div class="todo-list-page">${todoCards()}</div></section>
    <section data-view="interests" class="view" hidden><div class="section-heading"><div><span class="eyebrow">Interest Engine</span><h2>What feeds your curiosity?</h2><p>Ratings guide future content. You stay in control of the signal.</p></div></div><div class="interest-grid">${interestCards()}</div><article class="suggestions-panel"><div class="form-heading"><div><span class="eyebrow">Engine suggestions</span><h3>Branches worth exploring</h3></div><span class="eyebrow">Based on your map</span></div><div class="suggestion-grid">${suggestionCards()}</div></article><form class="card add-interest-form" id="add-interest-form"><div class="form-heading"><h3>Add an interest</h3><span class="eyebrow">Saved to your account</span></div><div class="form-fields"><label>Name<input name="name" required placeholder="e.g. cozy games"></label><label>Type<select name="category">${INTEREST_CATEGORIES.map((category) => `<option value="${category.id}">${category.label}</option>`).join('')}</select></label><label>Rating<select name="rating">${[1, 2, 3, 4, 5].map((rating) => `<option value="${rating}" ${rating === 3 ? 'selected' : ''}>${rating}/5</option>`).join('')}</select></label><button class="button" type="submit">Add interest</button></div></form><article class="card memory-panel"><div class="form-heading"><div><span class="eyebrow">Private memory</span><h3>What should the future assistant know?</h3></div><span class="eyebrow">Fully editable</span></div><p>Only memories saved here will be eligible as personal context for the assistant. You can edit or delete them at any time.</p><div class="memory-list">${memoryCards()}</div><form id="memory-form" class="memory-form"><textarea name="text" maxlength="500" required placeholder="Example: I prefer short, practical morning plans."></textarea><button class="button" type="submit">Save memory</button></form></article></section>
    <section data-view="games" class="view" hidden>${gamesView()}</section>
    <section data-view="projects" class="view" hidden><div class="section-heading"><div><span class="eyebrow">Projects</span><h2>Keep the garden growing.</h2><p>Only the next useful actions belong here for now.</p></div></div><div class="project-grid">${projectCards()}</div></section>
  </main><nav class="bottom-nav" aria-label="Primary navigation">${sections.map((item) => `<button data-nav="${item.id}" class="nav-item ${item.id === section ? 'is-selected' : ''}"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`).join('')}</nav><div id="modal-root"></div>${globalChatView()}`;
  setSection(section);
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => setSection(button.dataset.nav)));
  document.querySelectorAll('[data-action="toggle-chat"]').forEach((button) => button.addEventListener('click', () => { chatOpen = !chatOpen; if (chatOpen) chatUnreadCount = 0; const section = activeSection(); render(); setSection(section); }));
  document.querySelectorAll('[data-open-game]').forEach((button) => button.addEventListener('click', () => { activeGame = button.dataset.openGame; render(); setSection('games'); }));
  document.querySelector('[data-action="close-game"]')?.addEventListener('click', () => { activeGame = null; render(); setSection('games'); });
  document.querySelector('#chat-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const input = event.currentTarget.elements.message; try { const message = await sendChatMessage(input.value); chatMessages = [...chatMessages, message].slice(-APP_CONFIG.chatMaxMessages); input.value = ''; chatOpen = true; const section = activeSection(); render(); setSection(section); } catch (error) { window.alert(error.message); } });
  document.querySelector('[data-action="start-game"]')?.addEventListener('click', () => { state.games.getToKnowMe = startRound(state.games.getToKnowMe, state.interests); saveState(state); render(); setSection('games'); });
  document.querySelector('#wordle-form')?.addEventListener('submit', (event) => { event.preventDefault(); const input = event.currentTarget.elements.guess; try { const answer = state.games.wordle.date === dailyWordle.date ? dailyWordle.answer : getDailyAnswer(new Date(`${state.games.wordle.date}T00:00:00Z`)); state.games.wordle = submitWordleGuess(state.games.wordle, input.value, answer); saveState(state); render(); setSection('games'); } catch (error) { window.alert(error.message); } });
  document.querySelector('[data-action="share-wordle"]')?.addEventListener('click', async () => { try { await sendChatMessage(wordleShareText()); window.alert('Your Wordle result was shared to garden chat.'); } catch (error) { window.alert(error.message); } });
  document.querySelectorAll('[data-game-answer]').forEach((button) => button.addEventListener('click', () => { try { const nextGame = recordAnswer(state.games.getToKnowMe, button.dataset.gameAnswer); const answer = nextGame.answers[nextGame.answers.length - 1]; state.games.getToKnowMe = nextGame; applyGameAnswer(answer); saveState(state); render(); setSection('games'); } catch (error) { window.alert(error.message); } }));
  document.querySelector('[data-action="account"]')?.addEventListener('click', () => renderAccountSettings());
  document.querySelector('[data-action="logout"]')?.addEventListener('click', async () => { await logout(); clearInterval(chatPollTimer); currentUser = null; state = null; chatMessages = []; chatOpen = false; chatUnreadCount = 0; renderAuth(); });
  document.querySelector('#add-interest-form')?.addEventListener('submit', (event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); try { state.interests.push(createInterest({ name: formData.get('name'), category: formData.get('category'), rating: formData.get('rating') })); saveState(state); render(); setSection('interests'); } catch (error) { window.alert(error.message); } });
  document.querySelectorAll('[data-add-suggestion]').forEach((button) => button.addEventListener('click', () => { state.interests.push(createInterest({ name: button.dataset.addSuggestion, category: button.dataset.suggestionCategory, rating: 3, source: 'suggestion' })); saveState(state); render(); setSection('interests'); }));
  document.querySelectorAll('[data-remove-interest]').forEach((button) => button.addEventListener('click', () => { if (!window.confirm('Remove this interest?')) return; state.interests = state.interests.filter((interest) => interest.id !== button.dataset.removeInterest); saveState(state); render(); setSection('interests'); }));
  document.querySelectorAll('[data-edit-interest]').forEach((button) => button.addEventListener('click', () => { const interest = state.interests.find((item) => item.id === button.dataset.editInterest); if (!interest) return; const name = window.prompt('Interest name', interest.name)?.trim(); if (!name) return; const rating = window.prompt('Rating from 1 to 5', String(interest.rating)); if (rating === null) return; interest.name = name; interest.rating = Math.min(APP_CONFIG.maxInterestRating, Math.max(APP_CONFIG.minInterestRating, Math.round(Number(rating) || interest.rating))); saveState(state); render(); setSection('interests'); }));
  document.querySelector('#memory-form')?.addEventListener('submit', (event) => { event.preventDefault(); const text = new FormData(event.currentTarget).get('text')?.trim(); if (!text) return; state.memories.push({ id: `memory-${Date.now()}`, text, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); saveState(state); render(); setSection('interests'); });
  document.querySelectorAll('[data-save-memory]').forEach((button) => button.addEventListener('click', () => { const memory = state.memories.find((item) => item.id === button.dataset.saveMemory); const input = document.querySelector(`[data-memory-input="${button.dataset.saveMemory}"]`); if (memory && input?.value.trim()) { memory.text = input.value.trim(); memory.updatedAt = new Date().toISOString(); saveState(state); render(); setSection('interests'); } }));
  document.querySelectorAll('[data-remove-memory]').forEach((button) => button.addEventListener('click', () => { state.memories = state.memories.filter((memory) => memory.id !== button.dataset.removeMemory); saveState(state); render(); setSection('interests'); }));
  document.querySelectorAll('[data-todo-filter]').forEach((input) => input.addEventListener(input.tagName === 'INPUT' ? 'input' : 'change', () => { todoFilters[input.dataset.todoFilter] = input.value; render(); setSection('todos'); }));
  document.querySelectorAll('[data-todo]').forEach((input) => input.addEventListener('change', () => { const todo = state.todos.find((item) => item.id === input.dataset.todo); if (todo) { todo.done = input.checked; todo.updatedAt = new Date().toISOString(); } saveState(state); render(); setSection(input.closest('[data-view]')?.dataset.view || 'todos'); }));
  document.querySelector('#todo-form')?.addEventListener('submit', (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { state.todos.unshift(createTodo({ title: values.title, tags: values.tags, projectId: values.projectId, addedBy: currentUser.id, assignedTo: values.assignedTo })); saveState(state); render(); setSection('todos'); } catch (error) { window.alert(error.message); } });
  document.querySelectorAll('[data-add-todo]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); const title = new FormData(form).get('title')?.trim(); const project = state.projects.find((item) => item.id === form.dataset.addTodo); if (title && project) { try { state.todos.unshift(createTodo({ title, projectId: project.id, addedBy: currentUser.id })); saveState(state); render(); setSection('projects'); } catch (error) { window.alert(error.message); } } }));
  document.querySelectorAll('[data-edit-todo]').forEach((button) => button.addEventListener('click', () => { const todo = state.todos.find((item) => item.id === button.dataset.editTodo); if (!todo) return; const title = window.prompt('Todo title', todo.title)?.trim(); if (!title) return; if (title.length > APP_CONFIG.maxTodoTitleLength) { window.alert(`Todo titles must be ${APP_CONFIG.maxTodoTitleLength} characters or fewer.`); return; } const tags = window.prompt('Tags, separated by commas', todo.tags.join(', ')); if (tags === null) return; const assignment = window.prompt(`For whom? Enter: ${todoMembers().map((member) => member.username).join(', ')}`, memberName(todo.assignedTo)); if (assignment === null) return; const member = todoMembers().find((item) => item.username.toLocaleLowerCase() === assignment.trim().toLocaleLowerCase()); if (!member) { window.alert('Choose one of the listed people.'); return; } todo.title = title; todo.tags = normalizeTags(tags); todo.assignedTo = member.id; todo.updatedAt = new Date().toISOString(); saveState(state); render(); setSection('todos'); }));
  document.querySelectorAll('[data-remove-todo]').forEach((button) => button.addEventListener('click', () => { if (!window.confirm('Delete this todo?')) return; state.todos = state.todos.filter((todo) => todo.id !== button.dataset.removeTodo); saveState(state); render(); setSection('todos'); }));
}

function minimalLanding() {
  const openTasks = Array.isArray(state?.todos) ? state.todos.filter((todo) => !todo.done).length : 0;
  const featuredCard = guestMode
    ? '<article class="editorial-card editorial-card-featured" data-reveal><span class="editorial-index">02</span><h3>A quiet beginning</h3><p>Sign in when you are ready to make this garden your own. For now, take a look around.</p><span class="editorial-card-link">Guest view</span></article>'
    : `<article class="editorial-card editorial-card-featured" data-reveal><span class="editorial-index">02</span><h3>${openTasks} tasks open</h3><p>Praesent commodo cursus magna, vel scelerisque nisl consectetur et. The smallest step still counts.</p><button class="editorial-card-link" data-minimal-account>Visit your account <span class="editorial-arrow">↗</span></button></article>`;
  return `<div class="editorial-landing"><section class="editorial-hero" data-reveal><div class="editorial-hero-copy"><span class="editorial-kicker">Personal signal / 001</span><h1>Make room for <span class="editorial-word" data-reveal-word>what matters.</span></h1><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. A small, private place for attention, ideas, and the next useful thing.</p><button class="editorial-link" data-scroll-target="editorial-field">Enter the garden <span class="editorial-arrow">↗</span></button></div><div class="editorial-loop" data-hover-visual role="img" aria-label="Animated maroon and black garden loop"><div class="loop-orbit loop-orbit-one"></div><div class="loop-orbit loop-orbit-two"></div><div class="loop-core">MG</div><span class="loop-caption">loop / 001</span></div></section><section class="editorial-field" id="editorial-field"><div class="editorial-field-intro" data-reveal><span class="editorial-kicker">A little context</span><h2>There is more than one way to begin.</h2></div><div class="editorial-card-grid"><article class="editorial-card" data-reveal><span class="editorial-index">01</span><h3>Small signals</h3><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec vitae sapien at orci pretium.</p><button class="editorial-card-link">Open the quiet <span class="editorial-arrow">↗</span></button></article>${featuredCard}<article class="editorial-card" data-reveal><span class="editorial-index">03</span><h3>Keep looking</h3><p>Integer posuere erat a ante venenatis dapibus posuere velit aliquet. Follow the thread.</p><button class="editorial-card-link">Read the signal <span class="editorial-arrow">↗</span></button></article></div></section><section class="editorial-statement" data-reveal><p>“Lorem ipsum dolor sit amet, consectetur adipiscing elit. The garden is still becoming.”</p><span class="editorial-kicker">The Mulch Garden / 2026</span></section></div>`;
}

function signalPage() {
  return `<section class="signal-page"><div class="settings-heading"><span class="editorial-kicker">Signal / 003</span><h2>A quiet place for the next thing.</h2><p>This preloaded placeholder shows how another section can join the garden without a page reload.</p></div><div class="signal-grid"><article class="signal-card"><span class="editorial-index">01</span><h3>Already here</h3><p>The shell, navigation, and page surfaces stay mounted while the view slides.</p></article><article class="signal-card"><span class="editorial-index">02</span><h3>Ready when needed</h3><p>Future data-heavy sections can fetch their content after the transition begins.</p></article></div></section>`;
}

function portfolioPage() {
  return `<section class="portfolio-page"><div class="portfolio-hero"><div class="portfolio-hero-copy"><span class="editorial-kicker">Builder portfolio / 2026</span><h2>I make useful things feel <em>clear.</em></h2><p>A working collection of software, systems, and creative projects—built with curiosity, care, and an eye for the next useful step.</p><div class="portfolio-actions"><button class="portfolio-button" data-scroll-target="portfolio-work">Explore the work <span class="editorial-arrow">↓</span></button><button class="portfolio-text-link" data-scroll-target="portfolio-about">A little more about me <span class="editorial-arrow">↗</span></button></div></div><div class="portfolio-orbit" aria-hidden="true"><div class="portfolio-orbit-ring portfolio-orbit-ring-one"></div><div class="portfolio-orbit-ring portfolio-orbit-ring-two"></div><div class="portfolio-orbit-core">MG</div><span class="portfolio-orbit-label portfolio-orbit-label-top">systems</span><span class="portfolio-orbit-label portfolio-orbit-label-right">craft</span><span class="portfolio-orbit-label portfolio-orbit-label-bottom">curiosity</span></div></div><section class="portfolio-work" id="portfolio-work"><div class="portfolio-section-heading"><div><span class="editorial-kicker">Selected work / 001</span><h3>Projects with somewhere to go.</h3></div><p>A mix of personal software, professional work, and experiments still becoming.</p></div><div class="portfolio-project-grid"><article class="portfolio-project portfolio-project-featured"><div class="portfolio-project-topline"><span class="portfolio-project-number">01</span><span class="portfolio-status portfolio-status-active">Active now</span></div><div class="portfolio-project-body"><span class="portfolio-project-type">Personal platform</span><h3>The Mulch Garden</h3><p>A private productivity and information hub for projects, interests, todos, games, and future integrations.</p><div class="portfolio-tags"><span>Node.js</span><span>MVC</span><span>Vanilla JS</span></div></div><div class="portfolio-project-footer"><span>Work rhythm</span><strong>Several sessions / week</strong><button data-minimal-home>Open project <span class="editorial-arrow">↗</span></button></div></article><article class="portfolio-project"><div class="portfolio-project-topline"><span class="portfolio-project-number">02</span><span class="portfolio-status portfolio-status-building">Building</span></div><div class="portfolio-project-body"><span class="portfolio-project-type">Personal project</span><h3>SaberDueler</h3><p>An ongoing project exploring game ideas, interaction, and the satisfaction of making a small world respond well.</p><div class="portfolio-tags"><span>Game design</span><span>Experimentation</span></div></div><div class="portfolio-project-footer"><span>Work rhythm</span><strong>Focused build sprints</strong><span class="portfolio-footer-arrow">↗</span></div></article><article class="portfolio-project"><div class="portfolio-project-topline"><span class="portfolio-project-number">03</span><span class="portfolio-status portfolio-status-ongoing">Ongoing</span></div><div class="portfolio-project-body"><span class="portfolio-project-type">Professional / creative</span><h3>GMCHE art class</h3><p>Professional work connecting organization, creative practice, and the details that help people learn.</p><div class="portfolio-tags"><span>Creative systems</span><span>Education</span></div></div><div class="portfolio-project-footer"><span>Work rhythm</span><strong>Project-based / steady</strong><span class="portfolio-footer-arrow">↗</span></div></article></div></section><section class="portfolio-rhythm"><div class="portfolio-section-heading"><div><span class="editorial-kicker">Working rhythm / 002</span><h3>Progress is a practice.</h3></div><p>The work changes shape, but the habit stays visible: make a small improvement, then come back for the next one.</p></div><div class="portfolio-rhythm-panel"><div class="portfolio-rhythm-intro"><span class="portfolio-rhythm-mark">↗</span><p>I work best when a project has a clear next action, room for iteration, and enough structure to keep momentum without smothering curiosity.</p></div><div class="portfolio-rhythm-list"><div><span>Active build</span><i><b style="width: 88%"></b></i><strong>Now</strong></div><div><span>Focused sprint</span><i><b style="width: 64%"></b></i><strong>When it matters</strong></div><div><span>Reflection &amp; polish</span><i><b style="width: 42%"></b></i><strong>Always nearby</strong></div></div></div></section><section class="portfolio-about" id="portfolio-about"><div class="portfolio-about-card"><span class="editorial-kicker">About the builder / 003</span><h3>Thoughtful systems. Human-sized steps.</h3><p>I’m interested in the space where software, creativity, and everyday usefulness meet. I like building foundations that stay understandable: clear interfaces, small modules, portable data, and room to grow.</p><p>This portfolio is a living page. More detailed case studies, links, and contact information can be added as each project reaches a shareable milestone.</p><button class="portfolio-button portfolio-button-light" data-scroll-target="portfolio-work">Explore the work <span class="editorial-arrow">↗</span></button></div><div class="portfolio-about-aside"><span>04</span><p>Open to useful problems, kind teams, and work that rewards careful thinking.</p></div></section></section>`;
}

const renderPortfolioPage = () => portfolioPage().replace('I make useful things feel', 'Make useful things feel');

function aboutPage() {
  return `<section class="about-page"><div class="about-hero"><div><span class="editorial-kicker">About the builder / 002</span><h2>Good work needs a clear <em>point of view.</em></h2><p>I’m interested in the space where software, creativity, and everyday usefulness meet. I build foundations that stay understandable: clear interfaces, small modules, portable data, and room to grow.</p></div><aside class="about-signal"><span class="editorial-kicker">Current mode</span><strong>Building with intent.</strong><div class="about-signal-line"><i aria-hidden="true"></i> Open to useful problems</div></aside></div><section class="about-profile"><article class="about-profile-card"><span class="editorial-kicker">A little more context</span><h3>Thoughtful systems. Human-sized steps.</h3><p>I like projects with a clear next action, enough structure to keep momentum, and enough room for iteration to make the result better.</p><p>This is a living portfolio. As each project reaches a shareable milestone, the work can grow into a clearer case study with the decisions, process, and lessons behind it.</p><button class="portfolio-button portfolio-button-light" data-minimal-portfolio>View the work <span class="editorial-arrow">↗</span></button></article><aside class="about-profile-aside"><span>02—03</span><p>Open to kind teams, useful problems, and work that rewards careful thinking.</p><div class="about-profile-meta"><span>Focus</span><strong>Software · systems · craft</strong></div></aside></section><section class="portfolio-rhythm"><div class="portfolio-section-heading"><div><span class="editorial-kicker">Working rhythm / 003</span><h3>Progress is a practice.</h3></div><p>The work changes shape, but the habit stays visible: make a small improvement, then come back for the next one.</p></div><div class="portfolio-rhythm-panel"><div class="portfolio-rhythm-intro"><span class="portfolio-rhythm-mark">↗</span><p>I work best when a project has a clear next action, room for iteration, and enough structure to keep momentum without smothering curiosity.</p></div><div class="portfolio-rhythm-list"><div><span>Active build</span><i><b style="width: 88%"></b></i><strong>Now</strong></div><div><span>Focused sprint</span><i><b style="width: 64%"></b></i><strong>When it matters</strong></div><div><span>Reflection &amp; polish</span><i><b style="width: 42%"></b></i><strong>Always nearby</strong></div></div></div></section></section>`;
}

function ensureBoardState() {
  if (!state.board || typeof state.board !== 'object') state.board = {};
  if (!Array.isArray(state.board.githubProfiles)) state.board.githubProfiles = [];
  if (!Array.isArray(state.board.folders) || !state.board.folders.length) state.board.folders = [{ id: 'board-folder-inbox', name: 'Inbox' }];
  if (!Array.isArray(state.board.projects)) state.board.projects = [];
  return state.board;
}

function boardProfileUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://github.com/${raw.replace(/^@/, '')}`);
    if (url.hostname.toLowerCase() !== 'github.com') return null;
    const username = url.pathname.split('/').filter(Boolean)[0];
    if (!username || !/^[A-Za-z0-9-]{1,39}$/.test(username)) return null;
    return { username, url: `https://github.com/${username}` };
  } catch { return null; }
}

function boardAllRepos(board) {
  return board.githubProfiles.flatMap((profile) => (boardRepoCache[profile.username] || []).map((repo) => ({ ...repo, boardOwner: profile.username })));
}

function boardValues(board, key) {
  const values = boardAllRepos(board).flatMap((repo) => key === 'owner' ? [repo.owner?.login || repo.boardOwner] : key === 'topic' ? (repo.topics || []) : [repo[key]]);
  return [...new Set([...values, ...board.projects.flatMap((project) => key === 'owner' ? [project.ownerUsername] : key === 'topic' ? (project.topics || []) : [project[key]])].filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function boardMatches(item) {
  const query = boardFilters.query.trim().toLocaleLowerCase();
  const topics = Array.isArray(item.topics) ? item.topics : [];
  const owner = item.owner?.login || item.boardOwner || item.ownerUsername || '';
  const text = [item.name, item.title, item.description, item.note, item.language, owner, ...topics].filter(Boolean).join(' ').toLocaleLowerCase();
  return (!query || text.includes(query))
    && (boardFilters.folder === 'all' || item.kind === 'repo' || item.folderId === boardFilters.folder)
    && (boardFilters.language === 'all' || item.language === boardFilters.language)
    && (boardFilters.topic === 'all' || topics.includes(boardFilters.topic))
    && (boardFilters.owner === 'all' || owner === boardFilters.owner);
}

function boardVisibilityLabel(project) {
  if (project.visibility === 'all') return 'All users';
  if (project.visibility === 'members') return `${(project.memberIds || []).length} people${(project.groupNames || []).length ? ` · ${(project.groupNames || []).length} groups` : ''}`;
  return 'Private';
}

function boardRepoCard(repo) {
  const linked = ensureBoardState().projects.find((project) => project.repoUrl === repo.html_url);
  const topics = (repo.topics || []).slice(0, 4);
  return `<article class="board-card board-repo-card"><div class="board-card-topline"><span class="board-source-pill">GitHub repo</span><span class="board-card-owner">${escapeHtml(repo.owner?.login || repo.boardOwner)}</span></div><div class="board-card-copy"><h3>${escapeHtml(repo.name)}</h3><p>${escapeHtml(repo.description || 'No description yet. Add a note when you pin this project to the board.')}</p></div><div class="board-card-meta"><span>${escapeHtml(repo.language || 'Unspecified')}</span><span>${Number(repo.stargazers_count || 0)} stars</span><span>Updated ${escapeHtml(new Date(repo.updated_at || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span></div><div class="board-tag-row">${topics.map((topic) => `<span>${escapeHtml(topic)}</span>`).join('')}</div><div class="board-card-actions">${linked ? `<span class="board-linked-state">Pinned · ${escapeHtml(boardVisibilityLabel(linked))}</span>` : `<button class="button button-quiet" data-board-link-repo data-board-owner="${escapeHtml(repo.owner?.login || repo.boardOwner)}" data-board-repo="${escapeHtml(repo.name)}">Pin to board</button>`}<a class="text-button" href="${escapeHtml(repo.html_url)}" target="_blank" rel="noreferrer">Open on GitHub ↗</a></div></article>`;
}

function boardProjectCard(project) {
  const folder = ensureBoardState().folders.find((item) => item.id === project.folderId);
  return `<article class="board-card board-project-card"><div class="board-card-topline"><span class="board-source-pill board-source-project">Board project</span><span class="board-card-owner">${escapeHtml(project.ownerUsername || currentUser.username)}</span></div><div class="board-card-copy"><h3>${escapeHtml(project.title)}</h3><p>${escapeHtml(project.note || project.description || 'A project idea waiting for its next useful step.')}</p></div><div class="board-card-meta"><span>${escapeHtml(project.language || 'Concept')}</span><span>${escapeHtml(boardVisibilityLabel(project))}</span><span>${escapeHtml(folder?.name || 'Inbox')}</span></div><div class="board-tag-row">${(project.topics || []).map((topic) => `<span>${escapeHtml(topic)}</span>`).join('')}</div><div class="board-card-actions">${project.repoUrl ? `<a class="text-button" href="${escapeHtml(project.repoUrl)}" target="_blank" rel="noreferrer">Open source ↗</a>` : '<span class="board-linked-state">Idea / concept</span>'}<button class="text-button danger" data-board-remove="${escapeHtml(project.id)}">Remove from board</button></div></article>`;
}

function boardPage() {
  const board = ensureBoardState();
  const repos = boardAllRepos(board).filter(boardMatches);
  const projects = board.projects.filter(boardMatches);
  const languages = boardValues(board, 'language');
  const topics = boardValues(board, 'topic');
  const owners = boardValues(board, 'owner');
  const cards = [...projects.map(boardProjectCard), ...repos.map(boardRepoCard)].join('');
  const profileCards = board.githubProfiles.length ? board.githubProfiles.map((profile) => `<div class="board-profile-row"><span class="board-profile-mark">GH</span><div><strong>${escapeHtml(profile.username)}</strong><span>${(boardRepoCache[profile.username] || []).length || '—'} public repos loaded</span></div><button class="text-button" data-board-refresh="${escapeHtml(profile.username)}">Refresh</button><button class="text-button danger" data-board-unlink="${escapeHtml(profile.username)}">Unlink</button></div>`).join('') : '<p class="board-empty-copy">No profiles connected yet. A public profile URL is all this board needs.</p>';
  const memberChecks = members.filter((member) => member.id !== currentUser.id).map((member) => `<label class="board-check"><input type="checkbox" name="memberIds" value="${escapeHtml(member.id)}"><span>${escapeHtml(member.username)}</span></label>`).join('');
  return `<section class="board-page"><div class="board-layout"><aside class="board-sidebar"><div class="board-sidebar-heading"><span class="editorial-kicker">Project board / 004</span><h2>Shared work, clearly held.</h2><p>Link public GitHub work, keep ideas in folders, and decide who can see each project.</p></div><div class="board-sidebar-section"><div class="board-sidebar-label"><span>Folders</span><button class="text-button" data-board-add-folder>＋</button></div><button class="board-folder-link ${boardFilters.folder === 'all' ? 'is-active' : ''}" data-board-folder="all"><span>All projects</span><strong>${board.projects.length + boardAllRepos(board).length}</strong></button>${board.folders.map((folder) => `<button class="board-folder-link ${boardFilters.folder === folder.id ? 'is-active' : ''}" data-board-folder="${escapeHtml(folder.id)}"><span>${escapeHtml(folder.name)}</span><strong>${board.projects.filter((project) => project.folderId === folder.id).length}</strong></button>`).join('')}</div><div class="board-sidebar-section"><div class="board-sidebar-label"><span>GitHub profiles</span><span class="board-count">${board.githubProfiles.length}/3</span></div>${profileCards}<form id="board-github-form" class="board-sidebar-form"><label>Public profile URL<input name="profileUrl" required placeholder="github.com/username" autocomplete="url"></label><button class="button button-quiet" type="submit" ${board.githubProfiles.length >= 3 ? 'disabled' : ''}>Link profile</button></form></div><div class="board-sidebar-note"><span class="editorial-kicker">Safety boundary</span><p>Mulch Garden only reads public repository metadata. It never receives GitHub passwords, tokens, or write access.</p></div>${currentUser.role === 'admin' ? '<div class="board-admin-note"><span class="editorial-kicker">Admin view</span><p>Moderation can hide or remove board entries. Removing a card never deletes the source repository on GitHub.</p></div>' : ''}</aside><main class="board-main"><div class="board-main-heading"><div><span class="editorial-kicker">A social project surface</span><h2>Projects with somewhere to go.</h2><p>Browse public repositories and collect the concepts worth sharing with the right people.</p></div><details class="board-compose"><summary><span>＋</span> Add a project</summary><form id="board-project-form"><label>Project name<input name="title" required maxlength="100" placeholder="A project, idea, or code base"></label><label>Source URL<input name="repoUrl" type="url" placeholder="https://github.com/…"></label><label>Note<textarea name="note" maxlength="500" placeholder="Why is this worth sharing?"></textarea></label><div class="board-form-grid"><label>Folder<select name="folderId">${board.folders.map((folder) => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`).join('')}</select></label><label>Language<input name="language" placeholder="JavaScript, Python…"></label></div><label>Topics<input name="topics" placeholder="agents, games, design"></label><label>Share with<select name="visibility"><option value="private">Private to me</option><option value="members">Specific people / groups</option><option value="all">All users</option></select></label><fieldset class="board-share-people"><legend>Specific people</legend>${memberChecks || '<span class="field-note">No other users are available yet.</span>'}</fieldset><label>Group names<input name="groupNames" placeholder="e.g. game builders, study group"></label><button class="button" type="submit">Add to board</button></form></details></div><div class="board-stats"><article><strong>${boardAllRepos(board).length}</strong><span>public repos loaded</span></article><article><strong>${board.projects.length}</strong><span>board projects</span></article><article><strong>${board.githubProfiles.length}/3</strong><span>GitHub profiles</span></article></div><div class="board-toolbar"><label class="board-search">Search board<input data-board-filter="query" value="${escapeHtml(boardFilters.query)}" placeholder="Search projects, users, topics…"></label><label>Folder<select data-board-filter="folder"><option value="all">All folders</option>${board.folders.map((folder) => `<option value="${escapeHtml(folder.id)}" ${boardFilters.folder === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`).join('')}</select></label><label>Language<select data-board-filter="language"><option value="all">All languages</option>${languages.map((language) => `<option value="${escapeHtml(language)}" ${boardFilters.language === language ? 'selected' : ''}>${escapeHtml(language)}</option>`).join('')}</select></label><label>Topic<select data-board-filter="topic"><option value="all">All topics</option>${topics.map((topic) => `<option value="${escapeHtml(topic)}" ${boardFilters.topic === topic ? 'selected' : ''}>${escapeHtml(topic)}</option>`).join('')}</label><label>User<select data-board-filter="owner"><option value="all">All users</option>${owners.map((owner) => `<option value="${escapeHtml(owner)}" ${boardFilters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}</select></label></div><div class="board-results-heading"><span>${cards ? `${projects.length + repos.length} results` : 'No projects yet'}</span><span>Public metadata · curated by people</span></div><div class="board-grid">${cards || '<article class="board-empty-state"><span class="board-empty-icon">⌘</span><h3>Start with a public GitHub profile.</h3><p>Link up to three profiles from the left. Their public repositories will appear here with search, language, topic, and user filters.</p></article>'}</div></main></div></section>`;
}

function securitySettings(message = '') {
  return `<section class="account-context"><div class="settings-heading"><span class="eyebrow">Sign-in & security</span><h2>Account access.</h2><p>Manage the details you use to sign in.</p></div><form class="settings-card security-card card" id="minimal-account-form">${message ? `<p class="form-success">${escapeHtml(message)}</p>` : ''}<section class="security-section"><div><span class="eyebrow">Account details</span><h3>Username</h3><p>This is how you identify yourself when signing in.</p></div><label>Username<input name="username" required value="${escapeHtml(currentUser.username)}" autocomplete="username"></label></section><section class="security-section"><div><span class="eyebrow">Password</span><h3>Change your password</h3><p>Use at least four characters. You can leave the new password blank to keep the current one.</p></div><div class="security-fields"><label>Current password<input name="currentPassword" type="password" required autocomplete="current-password"></label><label>New password<input name="newPassword" type="password" minlength="4" autocomplete="new-password"></label></div></section><div class="security-actions"><button class="button" type="submit">Save changes</button></div></form></section>`;
}

function profileInitials() {
  const name = ensureProfile().displayName || currentUser.username;
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase();
}

function profilePage(message = '') {
  const profile = ensureProfile();
  const avatar = profile.avatarDataUrl ? `<img src="${escapeHtml(profile.avatarDataUrl)}" alt="">` : `<span>${escapeHtml(profileInitials())}</span>`;
  return `<section class="account-context"><div class="settings-heading"><span class="eyebrow">Your profile</span><h2>Tell us about yourself.</h2><p>This information is private to your account and can be changed whenever you like.</p></div><form class="profile-card card" id="profile-form">${message ? `<p class="form-success">${escapeHtml(message)}</p>` : ''}<div class="profile-identity"><div class="profile-photo-field"><button type="button" class="profile-photo-dropzone" data-avatar-trigger aria-label="Choose a profile picture"><span class="profile-avatar">${avatar}</span><span class="profile-photo-overlay">Change photo</span></button><input id="avatar-input" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="profile-photo-actions"><button type="button" class="text-button" data-avatar-trigger>Upload photo</button><button type="button" class="text-button danger" data-avatar-remove>Remove</button></div><span class="field-note">Drag an image here or choose one. It will be cropped neatly.</span></div></div><div class="profile-fields"><label>Display name<input name="displayName" maxlength="80" value="${escapeHtml(profile.displayName)}" placeholder="How should people see you?"></label><label>About you<textarea name="bio" maxlength="500" placeholder="A few words about yourself">${escapeHtml(profile.bio)}</textarea></label><label>Location<input name="location" maxlength="80" value="${escapeHtml(profile.location)}" placeholder="Optional"></label></div><button class="button" type="submit">Save profile</button></form></section>`;
}

function accountPage(page = 'profile', message = '') {
  const profile = ensureProfile();
  return `<section class="account-layout"><aside class="account-sidebar"><div><span class="eyebrow">Account</span><strong>${escapeHtml(profile.displayName || currentUser.username)}</strong></div><nav aria-label="Account pages"><button class="account-link ${page === 'profile' ? 'is-active' : ''}" data-account-page="profile">Your Profile</button><button class="account-link ${page === 'security' ? 'is-active' : ''}" data-account-page="security">Sign-in & security</button></nav></aside><div class="account-main">${page === 'security' ? securitySettings(message) : profilePage(message)}</div></section>`;
}

function ensureProfile() {
  state.profile = { displayName: state.profile?.displayName || '', bio: state.profile?.bio || '', location: state.profile?.location || '', avatarDataUrl: state.profile?.avatarDataUrl || '' };
  return state.profile;
}

function resizeAvatar(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('That image could not be read.')); reader.onload = () => { const image = new Image(); image.onerror = () => reject(new Error('That image could not be loaded.')); image.onload = () => { const canvas = document.createElement('canvas'); const size = 192; canvas.width = size; canvas.height = size; const context = canvas.getContext('2d'); const scale = Math.max(size / image.width, size / image.height); const width = image.width * scale; const height = image.height * scale; context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height); const dataUrl = canvas.toDataURL('image/jpeg', 0.72); if (dataUrl.length > 90000) reject(new Error('Please choose a smaller image.')); else resolve(dataUrl); }; image.src = reader.result; }; reader.readAsDataURL(file); });
}

function previewAvatar(file) {
  if (!file) return;
  const image = document.querySelector('.profile-avatar');
  if (!image) return;
  const previewUrl = URL.createObjectURL(file);
  image.innerHTML = '';
  const preview = document.createElement('img');
  preview.alt = 'Selected profile picture preview';
  preview.src = previewUrl;
  preview.onload = () => URL.revokeObjectURL(previewUrl);
  image.append(preview);
}

const MINIMAL_VIEWS = ['landing', 'portfolio', 'board', 'about', 'account', 'signal'];
const MINIMAL_VIEW_STORAGE_PREFIX = 'mg_last_minimal_view:';
const MINIMAL_ACCOUNT_PAGE_STORAGE_PREFIX = 'mg_last_minimal_account_page:';
let minimalGlobalEventsBound = false;

function minimalViewIndex(view) { return Math.max(0, MINIMAL_VIEWS.indexOf(view)); }

function minimalStorageKey(prefix) {
  const identity = currentUser?.id || currentUser?.username || 'guest';
  return `${prefix}${identity}`;
}

function rememberedMinimalView() {
  try {
    const view = localStorage.getItem(minimalStorageKey(MINIMAL_VIEW_STORAGE_PREFIX));
    return MINIMAL_VIEWS.includes(view) ? view : 'landing';
  } catch {
    return 'landing';
  }
}

function rememberMinimalView(view, page) {
  if (!MINIMAL_VIEWS.includes(view)) return;
  try {
    localStorage.setItem(minimalStorageKey(MINIMAL_VIEW_STORAGE_PREFIX), view);
    if (view === 'account' && ['profile', 'security'].includes(page)) {
      localStorage.setItem(minimalStorageKey(MINIMAL_ACCOUNT_PAGE_STORAGE_PREFIX), page);
    }
  } catch {
    // The dashboard remains usable when localStorage is unavailable.
  }
}

function rememberedMinimalAccountPage() {
  try {
    const page = localStorage.getItem(minimalStorageKey(MINIMAL_ACCOUNT_PAGE_STORAGE_PREFIX));
    return ['profile', 'security'].includes(page) ? page : 'profile';
  } catch {
    return 'profile';
  }
}

function updateMinimalNavigation() {
  const view = root.dataset.minimalView || 'landing';
  const nav = root.querySelector('.editorial-nav nav');
  const activeSelector = view === 'landing' ? '[data-minimal-home]' : `[data-minimal-${view}]`;
  const activeLink = nav?.querySelector(activeSelector);
  if (nav && activeLink) {
    nav.style.setProperty('--nav-indicator-left', `${activeLink.offsetLeft}px`);
    nav.style.setProperty('--nav-indicator-width', `${activeLink.offsetWidth}px`);
  }
  root.querySelectorAll('[data-minimal-view-link]').forEach((link) => link.classList.toggle('is-active', link.dataset.minimalViewLink === view));
}

function updateMinimalViewportHeight() {
  const viewport = root.querySelector('.minimal-viewport');
  const view = root.dataset.minimalView || 'landing';
  const activeSlide = root.querySelector(`[data-minimal-slide="${view}"]`);
  if (viewport && activeSlide) viewport.style.height = `${activeSlide.scrollHeight}px`;
}

function resetMinimalScrollPosition() {
  const reset = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };
  reset();
  window.requestAnimationFrame(reset);
}

async function loadBoardProfile(username) {
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!response.ok) throw new Error(response.status === 404 ? 'That public GitHub profile could not be found.' : 'GitHub did not return public repositories right now.');
  boardRepoCache[username] = (await response.json()).filter((repo) => !repo.fork).map((repo) => ({ ...repo, topics: Array.isArray(repo.topics) ? repo.topics : [] }));
}

function queueBoardProfileLoads() {
  const pending = ensureBoardState().githubProfiles.filter((profile) => !boardRepoCache[profile.username]);
  if (!pending.length) return;
  Promise.allSettled(pending.map((profile) => loadBoardProfile(profile.username))).then(() => { if (root.dataset.minimalView === 'board') renderMinimal('board'); });
}

function bindBoardEvents() {
  document.querySelector('#board-github-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const board = ensureBoardState();
    const profile = boardProfileUrl(new FormData(event.currentTarget).get('profileUrl'));
    if (!profile) { window.alert('Enter a public GitHub profile URL, such as github.com/octocat.'); return; }
    if (board.githubProfiles.some((item) => item.username.toLocaleLowerCase() === profile.username.toLocaleLowerCase())) { window.alert('That GitHub profile is already linked.'); return; }
    if (board.githubProfiles.length >= 3) { window.alert('You can link up to three GitHub profiles.'); return; }
    board.githubProfiles.push({ ...profile, addedAt: new Date().toISOString() });
    await saveState(state);
    try { await loadBoardProfile(profile.username); renderMinimal('board'); } catch (error) { renderMinimal('board'); window.alert(error.message); }
  });
  document.querySelectorAll('[data-board-refresh]').forEach((button) => button.addEventListener('click', async () => { try { await loadBoardProfile(button.dataset.boardRefresh); renderMinimal('board'); } catch (error) { window.alert(error.message); } }));
  document.querySelectorAll('[data-board-unlink]').forEach((button) => button.addEventListener('click', async () => { const board = ensureBoardState(); board.githubProfiles = board.githubProfiles.filter((profile) => profile.username !== button.dataset.boardUnlink); delete boardRepoCache[button.dataset.boardUnlink]; await saveState(state); renderMinimal('board'); }));
  document.querySelectorAll('[data-board-folder]').forEach((button) => button.addEventListener('click', () => { boardFilters.folder = button.dataset.boardFolder; renderMinimal('board'); }));
  document.querySelector('[data-board-add-folder]')?.addEventListener('click', async () => { const name = window.prompt('Folder name', 'New folder')?.trim(); if (!name) return; const board = ensureBoardState(); board.folders.push({ id: `board-folder-${Date.now()}`, name: name.slice(0, 40) }); await saveState(state); renderMinimal('board'); });
  document.querySelectorAll('[data-board-filter]').forEach((input) => input.addEventListener(input.tagName === 'INPUT' ? 'input' : 'change', () => { boardFilters[input.dataset.boardFilter] = input.value; renderMinimal('board'); }));
  document.querySelectorAll('[data-board-link-repo]').forEach((button) => button.addEventListener('click', async () => { const board = ensureBoardState(); const repo = (boardRepoCache[button.dataset.boardOwner] || []).find((item) => item.name === button.dataset.boardRepo); if (!repo) return; board.projects.unshift({ id: `board-project-${Date.now()}`, title: repo.name, description: repo.description || '', note: '', repoUrl: repo.html_url, ownerUsername: repo.owner?.login || button.dataset.boardOwner, language: repo.language || '', topics: repo.topics || [], folderId: board.folders[0].id, visibility: 'private', memberIds: [], groupNames: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); await saveState(state); renderMinimal('board'); }));
  document.querySelector('#board-project-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const board = ensureBoardState(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const title = String(values.title || '').trim(); if (!title) return; const repoUrl = String(values.repoUrl || '').trim(); const memberIds = [...form.querySelectorAll('input[name="memberIds"]:checked')].map((input) => input.value); board.projects.unshift({ id: `board-project-${Date.now()}`, title: title.slice(0, 100), description: '', note: String(values.note || '').trim().slice(0, 500), repoUrl, ownerUsername: currentUser.username, language: String(values.language || '').trim().slice(0, 40), topics: String(values.topics || '').split(',').map((topic) => topic.trim().toLocaleLowerCase()).filter(Boolean).slice(0, 8), folderId: String(values.folderId || board.folders[0].id), visibility: ['members', 'all'].includes(values.visibility) ? values.visibility : 'private', memberIds, groupNames: String(values.groupNames || '').split(',').map((group) => group.trim()).filter(Boolean).slice(0, 5), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); await saveState(state); renderMinimal('board'); });
  document.querySelectorAll('[data-board-remove]').forEach((button) => button.addEventListener('click', async () => { const board = ensureBoardState(); board.projects = board.projects.filter((project) => project.id !== button.dataset.boardRemove); await saveState(state); renderMinimal('board'); }));
}

function bindMinimalEvents(view, page = 'profile') {
  if (!minimalGlobalEventsBound) {
    document.querySelectorAll('[data-minimal-account]').forEach((button) => button.addEventListener('click', () => renderMinimal('account', '', 'profile')));
    document.querySelectorAll('[data-minimal-portfolio]').forEach((button) => button.addEventListener('click', () => renderMinimal('portfolio')));
    document.querySelectorAll('[data-minimal-about]').forEach((button) => button.addEventListener('click', () => renderMinimal('about')));
    document.querySelectorAll('[data-minimal-board]').forEach((button) => button.addEventListener('click', () => renderMinimal('board')));
    document.querySelectorAll('[data-minimal-signal]').forEach((button) => button.addEventListener('click', () => renderMinimal('signal')));
    document.querySelectorAll('[data-minimal-home]').forEach((button) => button.addEventListener('click', () => {
      if (button.classList.contains('editorial-brand') && window.matchMedia('(max-width: 37.99rem)').matches) {
        document.querySelector('[data-menu-toggle]')?.click();
        return;
      }
      renderMinimal('landing');
    }));
    document.querySelectorAll('[data-minimal-logout]').forEach((button) => button.addEventListener('click', async () => {
      if (guestMode) {
        guestMode = false;
        const url = new URL(window.location.href);
        url.searchParams.delete('view');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        renderAuth();
        return;
      }
      await logout();
      currentUser = null;
      state = null;
      renderAuth();
    }));
    const menuToggle = document.querySelector('[data-menu-toggle]');
    const mobilePanel = document.querySelector('[data-mobile-panel]');
    menuToggle?.addEventListener('click', () => {
      const open = !mobilePanel?.hasAttribute('hidden');
      if (!mobilePanel) return;
      mobilePanel.toggleAttribute('hidden', open);
      menuToggle.setAttribute('aria-expanded', String(!open));
      menuToggle.classList.toggle('is-open', !open);
    });
    document.querySelectorAll('[data-scroll-target]').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.scrollTarget === 'portfolio-about') {
        renderMinimal('about');
        return;
      }
      document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth' });
    }));
    minimalGlobalEventsBound = true;
  }
  if (view === 'board') bindBoardEvents();
  document.querySelectorAll('[data-account-page]').forEach((button) => button.addEventListener('click', () => renderMinimal('account', '', button.dataset.accountPage)));
  const avatarInput = document.querySelector('#avatar-input');
  document.querySelectorAll('[data-avatar-trigger]').forEach((button) => button.addEventListener('click', () => avatarInput?.click()));
  avatarInput?.addEventListener('change', () => previewAvatar(avatarInput.files?.[0]));
  const avatarDropzone = document.querySelector('[data-avatar-trigger].profile-photo-dropzone');
  avatarDropzone?.addEventListener('dragover', (event) => { event.preventDefault(); avatarDropzone.classList.add('is-dragging'); });
  avatarDropzone?.addEventListener('dragleave', () => avatarDropzone.classList.remove('is-dragging'));
  avatarDropzone?.addEventListener('drop', (event) => { event.preventDefault(); avatarDropzone.classList.remove('is-dragging'); const file = event.dataTransfer.files?.[0]; if (!file || !avatarInput) return; try { const transfer = new DataTransfer(); transfer.items.add(file); avatarInput.files = transfer.files; previewAvatar(file); } catch { window.alert('Please use the Upload photo button for this browser.'); } });
  document.querySelector('[data-avatar-remove]')?.addEventListener('click', () => { ensureProfile().avatarDataUrl = ''; if (avatarInput) avatarInput.value = ''; const avatar = document.querySelector('.profile-avatar'); if (avatar) avatar.innerHTML = `<span>${escapeHtml(profileInitials())}</span>`; });
  document.querySelector('#minimal-account-form')?.addEventListener('submit', async (event) => { event.preventDefault(); try { currentUser = await updateAccount(Object.fromEntries(new FormData(event.currentTarget))); renderMinimal('account', 'Saved.', 'security'); } catch (error) { renderMinimal('account', error.message, 'security'); } });
  document.querySelector('#profile-form')?.addEventListener('submit', async (event) => { event.preventDefault(); try { const values = new FormData(event.currentTarget); const file = values.get('avatar'); let avatarDataUrl = state.profile.avatarDataUrl; if (file?.size) avatarDataUrl = await resizeAvatar(file); state.profile = { displayName: String(values.get('displayName') || '').trim(), bio: String(values.get('bio') || '').trim(), location: String(values.get('location') || '').trim(), avatarDataUrl }; await saveState(state); renderMinimal('account', 'Profile saved.', 'profile'); } catch (error) { renderMinimal('account', error.message, 'profile'); } });
  const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); }), { threshold: 0.16 }) : null;
  document.querySelectorAll('[data-reveal]').forEach((element) => revealObserver ? revealObserver.observe(element) : element.classList.add('is-visible'));
}

function renderMinimal(view = rememberedMinimalView(), message = '', page = rememberedMinimalAccountPage()) {
  if (guestMode) {
    view = ['portfolio', 'about'].includes(view) ? view : 'landing';
    page = 'profile';
    const url = new URL(window.location.href);
    if (['portfolio', 'about'].includes(view)) url.searchParams.set('view', view);
    else url.searchParams.delete('view');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }
  rememberMinimalView(view, page);
  const shell = root.querySelector('.minimal-shell');
  const accountSlide = root.querySelector('[data-minimal-slide="account"]');
  const firstLandingRender = !shell && view === 'landing';
  const previousView = root.dataset.minimalView;
  const returningToLanding = view === 'landing' && Boolean(shell);
  const waitsForSlide = Boolean(shell && previousView && previousView !== view);
  heroIntroReady = false;
  heroIntroConsumed = firstLandingRender || returningToLanding;
  heroIntroResetting = false;
  heroIntroInitialFull = firstLandingRender;
  window.clearTimeout(heroIntroResetTimer);
  document.documentElement.classList.remove('is-away-from-top', 'is-scrolling');
  root.dataset.minimalView = view;
  document.documentElement.classList.toggle('is-away-from-top', view !== 'landing' || firstLandingRender || returningToLanding);
  if (!shell) {
    const nav = guestMode ? '<nav aria-label="Guest navigation"><button class="editorial-nav-link" data-minimal-home data-minimal-view-link="landing">Home</button><button class="editorial-nav-link" data-minimal-portfolio data-minimal-view-link="portfolio">Portfolio</button><button class="editorial-nav-link" data-minimal-about data-minimal-view-link="about">About</button></nav>' : '<nav aria-label="Primary navigation"><button class="editorial-nav-link" data-minimal-home data-minimal-view-link="landing">Home</button><button class="editorial-nav-link" data-minimal-portfolio data-minimal-view-link="portfolio">Portfolio</button><button class="editorial-nav-link" data-minimal-board data-minimal-view-link="board">Board</button><button class="editorial-nav-link" data-minimal-about data-minimal-view-link="about">About</button><button class="editorial-nav-link" data-minimal-account data-minimal-view-link="account">Account</button><button class="editorial-nav-link" data-minimal-signal data-minimal-view-link="signal">Signal</button></nav>';
    const menu = '<button class="editorial-menu" data-menu-toggle aria-expanded="false" aria-controls="mobile-nav"><span class="menu-word">Menu</span><span class="menu-close">×</span></button>';
    const ctaLabel = guestMode ? 'Exit' : 'Log out';
    const mobilePrivateNav = guestMode ? '' : '<button class="editorial-mobile-link" data-minimal-account>Account</button><button class="editorial-mobile-link" data-minimal-signal>Signal</button>';
    const mobileBoardNav = guestMode ? '' : '<button class="editorial-mobile-link" data-minimal-board>Board</button>';
    const mobileNav = `<div class="editorial-mobile-panel" id="mobile-nav" data-mobile-panel hidden><button class="editorial-mobile-link" data-minimal-home>Home</button><button class="editorial-mobile-link" data-minimal-portfolio>Portfolio</button>${mobileBoardNav}<button class="editorial-mobile-link" data-minimal-about>About</button>${mobilePrivateNav}<button class="editorial-mobile-cta" data-minimal-logout>${ctaLabel} <span class="editorial-arrow">↗</span></button></div>`;
    const header = `<header class="editorial-nav"><div class="editorial-nav-row${guestMode ? ' guest-mode' : ''}"><button class="editorial-brand" data-minimal-home><span class="brand-mark" aria-hidden="true"><svg class="brand-glyph" viewBox="0 0 32 32" focusable="false"><circle cx="16" cy="16" r="11.25" class="brand-orbit"></circle><path d="M9.5 20.6c2.2-5.9 4.35-9.1 6.45-9.1 2.25 0 4.38 3.3 6.55 9.9" class="brand-stem"></path><path d="M11.2 13.5c1.6 1.2 3.15 1.35 4.8.35 1.45-.88 2.78-.75 4.8.55" class="brand-leaf"></path><circle cx="16" cy="16" r="1.4" class="brand-core"></circle></svg></span><span>The Mulch Garden</span></button>${nav}<button class="editorial-nav-cta" data-minimal-logout>${ctaLabel} <span class="editorial-arrow">↗</span></button>${menu}</div>${mobileNav}</header>`;
    const portfolioSlide = `<section class="minimal-slide" data-minimal-slide="portfolio">${renderPortfolioPage()}</section>`;
    const boardSlide = `<section class="minimal-slide" data-minimal-slide="board">${guestMode ? '' : boardPage()}</section>`;
    const aboutSlide = `<section class="minimal-slide" data-minimal-slide="about">${aboutPage()}</section>`;
    const privateSlides = guestMode ? '' : `<section class="minimal-slide" data-minimal-slide="account"><main class="minimal-page">${accountPage(page)}</main></section><section class="minimal-slide" data-minimal-slide="signal">${signalPage()}</section>`;
    root.innerHTML = `${header}<div class="minimal-viewport"><div class="minimal-shell minimal-track" style="--minimal-view-index: 0"><section class="minimal-slide" data-minimal-slide="landing">${minimalLanding()}</section>${portfolioSlide}${boardSlide}${aboutSlide}${privateSlides}</div></div>`;
    root.dataset.minimalAccountPage = page;
    bindMinimalEvents(view, page);
    if (view === 'board') queueBoardProfileLoads();
  } else if (view === 'board') {
    const boardSlide = root.querySelector('[data-minimal-slide="board"]');
    if (boardSlide) boardSlide.innerHTML = boardPage();
    bindBoardEvents();
    queueBoardProfileLoads();
  } else if (view === 'account' && (root.dataset.minimalAccountPage !== page || message)) {
    accountSlide.innerHTML = `<main class="minimal-page">${accountPage(page, message)}</main>`;
    root.dataset.minimalAccountPage = page;
    bindMinimalEvents(view, page);
  }
  const track = root.querySelector('.minimal-track');
  if (track) track.style.setProperty('--minimal-view-offset', `-${minimalViewIndex(view) * (100 / MINIMAL_VIEWS.length)}%`);
  resetMinimalScrollPosition();
  updateMinimalNavigation();
  const activateLandingView = () => {
    if (root.dataset.minimalView !== view) return;
    if (view === 'landing' && !firstLandingRender && !returningToLanding) {
      heroIntroConsumed = false;
      heroIntroInitialFull = false;
      document.documentElement.classList.remove('is-away-from-top');
    }
    heroIntroReady = view === 'landing';
    if (heroIntroReady) updateHeroIntroScale();
    updateMinimalViewportHeight();
  };
  const finishViewTransition = () => {
    if (root.dataset.minimalView !== view) return;
    resetMinimalScrollPosition();
    window.clearTimeout(heroIntroResetTimer);
    if (view === 'landing' && waitsForSlide) heroIntroResetTimer = window.setTimeout(activateLandingView, APP_CONFIG.performance.heroIntroResetMs);
    else activateLandingView();
  };
  if (waitsForSlide && track) track.addEventListener('transitionend', finishViewTransition, { once: true });
  else requestAnimationFrame(() => requestAnimationFrame(activateLandingView));
}

function renderAuth(message = '', loginOpen = false) {
  authLoginOpen = loginOpen;
  heroIntroConsumed = false;
  heroIntroResetting = false;
  heroIntroReady = false;
  heroIntroInitialFull = false;
  window.clearTimeout(heroIntroResetTimer);
  document.documentElement.classList.remove('is-away-from-top', 'is-scrolling');
  minimalGlobalEventsBound = false;
  if (authKeyHandler) document.removeEventListener('keydown', authKeyHandler);
  root.innerHTML = `<main class="auth-shell${authDarkMode ? '' : ' is-light'}"><section class="auth-card"><div class="auth-options"><button class="auth-option auth-option-login" type="button" data-action="open-login" aria-expanded="${loginOpen}" aria-controls="auth-login-panel">Login <span class="auth-option-arrow" aria-hidden="true">↓</span></button><div class="auth-login-panel${loginOpen ? ' is-open' : ''}" id="auth-login-panel" aria-hidden="${!loginOpen}"><div>${message ? `<p class="form-error">${escapeHtml(message)}</p>` : ''}<form id="auth-form"><label>Username<input name="username" required autocomplete="username" ${loginOpen ? '' : 'disabled'}></label><label>Password<input type="password" name="password" required autocomplete="current-password" ${loginOpen ? '' : 'disabled'}></label><button class="button" type="submit" ${loginOpen ? '' : 'disabled'}>Login</button></form></div></div><button class="auth-option auth-option-guest" type="button" data-action="guest">Enter as guest <span aria-hidden="true">↗</span></button></div></section></main>`;
  authKeyHandler = (event) => { const tag = event.target?.tagName?.toLowerCase(); if (event.key.toLocaleLowerCase() === 'd' && !event.ctrlKey && !event.metaKey && !event.altKey && !['input', 'textarea', 'select'].includes(tag)) { authDarkMode = !authDarkMode; renderAuth(message, loginOpen); } };
  document.querySelector('[data-action="open-login"]').addEventListener('click', () => { renderAuth('', true); document.querySelector('#auth-form input[name="username"]')?.focus(); });
  document.querySelector('[data-action="guest"]').addEventListener('click', () => { guestMode = true; currentUser = null; state = null; renderMinimal('landing'); });
  document.addEventListener('keydown', authKeyHandler);
  document.querySelector('#auth-form').addEventListener('submit', async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); try { currentUser = await login(values.get('username'), values.get('password')); guestMode = false; state = await loadState(); renderMinimal(); } catch (error) { renderAuth(error.message, true); } });
}

function renderAccountSettings(message = '') {
  const summary = summarizePreferences(state.interests);
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="onboarding-modal card" role="dialog" aria-modal="true" aria-labelledby="account-title"><div class="modal-topline"><span class="eyebrow">Account settings</span><button class="text-button" data-action="close-account">Close</button></div><h2 id="account-title">Update your sign-in</h2><article class="account-summary"><span class="eyebrow">What we know about you</span><p>${escapeHtml(summary.text)}</p><span class="field-note">Based on your saved, editable interests.</span></article><p>Changing your username or password ends the current login after this update.</p>${message ? `<p class="form-error">${escapeHtml(message)}</p>` : ''}<form id="account-form" class="account-form"><label>Username<input name="username" required value="${escapeHtml(currentUser.username)}" autocomplete="username"></label><label>Current password<input name="currentPassword" type="password" required autocomplete="current-password"></label><label>New password <span class="field-note">leave blank to keep it</span><input name="newPassword" type="password" minlength="4" autocomplete="new-password"></label><button class="button" type="submit">Save changes</button></form></section></div>`;
  document.querySelector('[data-action="close-account"]').addEventListener('click', () => { document.querySelector('#modal-root').innerHTML = ''; });
  document.querySelector('#account-form').addEventListener('submit', async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); try { currentUser = await updateAccount(Object.fromEntries(values)); document.querySelector('#modal-root').innerHTML = ''; render(); } catch (error) { renderAccountSettings(error.message); } });
}

async function init() {
  try { applyPerformanceProfile(); bindScrollIndicator(); bindHeroIntroGesture(); const requestedView = new URLSearchParams(window.location.search).get('view'); currentUser = await getCurrentUser(); if (!currentUser) { if (['portfolio', 'about'].includes(requestedView)) { guestMode = true; renderMinimal(requestedView); return; } renderAuth(); return; } guestMode = false; members = await loadMembers().catch(() => [{ id: currentUser.id, username: currentUser.username }]); chatMessages = (await loadChatMessages().catch(() => [])).slice(-APP_CONFIG.chatMaxMessages); dailyWordle = await loadDailyWordle().catch(() => dailyWordle); chatUnreadCount = 0; state = await loadState(); state = { ...state, interests: Array.isArray(state.interests) ? state.interests : [], projects: Array.isArray(state.projects) ? state.projects : [], memories: Array.isArray(state.memories) ? state.memories : [], feedback: Array.isArray(state.feedback) ? state.feedback : [], games: state.games && state.games.getToKnowMe ? { ...state.games, wordle: resetWordleForDate(state.games.wordle, dailyWordle.date) } : { getToKnowMe: createGetToKnowMeState(), wordle: createWordleState(dailyWordle.date) } }; const legacyTodos = state.projects.flatMap((project) => (Array.isArray(project.todos) ? project.todos.map((todo) => normalizeTodo(todo, project.id)) : [])); state.todos = Array.isArray(state.todos) && state.todos.length ? state.todos.map((todo) => normalizeTodo(todo)) : legacyTodos; renderMinimal(MINIMAL_VIEWS.includes(requestedView) ? requestedView : undefined); startChatPolling(); }
  catch (error) { renderAuth(error.message); }
}

init();
