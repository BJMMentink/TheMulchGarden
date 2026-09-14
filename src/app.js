import { APP_CONFIG, INTEREST_CATEGORIES, SECTIONS, USER_ROLES } from './config.js';
import { createInterest, suggestInterestCandidates } from './interest-engine.js';
import { findNewChatMessages, shouldShowChatTimestamp } from './chat-engine.js';
import { createGetToKnowMeState, getCurrentQuestion, getGameTheme, recordAnswer, startRound } from './get-to-know-me.js';
import { createWordleState, getDailyAnswer, getWordleDate, resetWordleForDate, submitWordleGuess } from './wordle.js';
import { summarizePreferences } from './profile-summary.js';
import { createTodo, filterTodos, normalizeTags, normalizeTodo, TODO_ASSIGNMENT_EVERYONE } from './todo-engine.js';
import { createAdminUser, getCurrentUser, loadAdminUsers, loadChatMessages, loadMembers, loadState, login, logout, saveState, sendChatMessage, updateAccount } from './storage.js';

let state;
let currentUser;
let members = [];
let adminUsers = [];
let chatMessages = [];
let chatOpen = false;
let chatUnreadCount = 0;
let chatPollTimer;
let todoFilters = { query: '', status: 'open', assignedTo: 'all' };
let selectedSection = APP_CONFIG.defaultSection;
let viewMode = 'user';
const root = document.querySelector('#app');

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

function isAdmin() {
  return currentUser?.role === USER_ROLES.ADMIN;
}

function isAdminMode() {
  return isAdmin() && viewMode === 'admin';
}

function visibleSections() {
  return isAdminMode() ? [...SECTIONS, { id: 'admin', label: 'Admin', icon: '⚙' }] : SECTIONS;
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
  const answer = getDailyAnswer(new Date(`${game.date}T00:00:00Z`));
  const rows = Array.from({ length: APP_CONFIG.wordleMaxGuesses }, (_, index) => {
    const guess = game.guesses[index];
    return `<div class="wordle-row">${Array.from({ length: APP_CONFIG.wordleWordLength }, (_, letterIndex) => guess ? `<span class="wordle-cell is-${guess.result[letterIndex]}">${guess.word[letterIndex]}</span>` : '<span class="wordle-cell"></span>').join('')}</div>`;
  }).join('');
  const message = game.status === 'won' ? 'Solved. The next puzzle arrives tomorrow.' : game.status === 'lost' ? `The word was ${answer}. Come back tomorrow for a new puzzle.` : 'Guess the five-letter word in six tries.';
  return `<article class="card game-card wordle-card"><div class="form-heading"><div><span class="eyebrow">Daily game · ${escapeHtml(game.date)}</span><h3>Daily Wordle</h3></div><span class="wordle-status ${game.status}">${game.guesses.length}/${APP_CONFIG.wordleMaxGuesses}</span></div><p>${message}</p><div class="wordle-board" aria-label="Daily Wordle board">${rows}</div>${game.status === 'playing' ? `<form class="wordle-form" id="wordle-form"><label class="sr-only" for="wordle-guess">Your five-letter guess</label><input id="wordle-guess" name="guess" required minlength="${APP_CONFIG.wordleWordLength}" maxlength="${APP_CONFIG.wordleWordLength}" pattern="[A-Za-z]{${APP_CONFIG.wordleWordLength}}" autocomplete="off" autocapitalize="characters" placeholder="GUESS"><button class="button" type="submit">Try</button></form>` : ''}<div class="wordle-legend"><span><i class="is-correct"></i>Right place</span><span><i class="is-present"></i>Wrong place</span><span><i class="is-absent"></i>Not in word</span></div></article>`;
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
  chatPollTimer = setInterval(refreshChat, APP_CONFIG.chatPollIntervalMs);
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

function adminUserCards() {
  if (!adminUsers.length) return '<article class="card empty-state"><h3>No accounts found.</h3><p>The administrator account list is empty.</p></article>';
  return adminUsers.map((user) => `<article class="admin-user-card card"><div><span class="eyebrow">${escapeHtml(user.role === USER_ROLES.ADMIN ? 'Administrator' : 'User')}</span><h3>${escapeHtml(user.username)}</h3></div><span class="count-badge">${user.id === currentUser.id ? 'You' : 'Account'}</span></article>`).join('');
}

function render() {
  const sections = visibleSections();
  const section = sections.some((item) => item.id === activeSection()) ? activeSection() : APP_CONFIG.defaultSection;
  root.innerHTML = `<header class="topbar"><div><p class="eyebrow">${escapeHtml(currentUser.username)} · Personal command center</p><h1>The Mulch Garden</h1></div><div class="topbar-actions">${isAdmin() ? `<label class="mode-switch"><input type="checkbox" data-action="toggle-mode" ${isAdminMode() ? 'checked' : ''}><span>${isAdminMode() ? 'Admin mode' : 'User mode'}</span></label>` : ''}<button class="text-button" data-action="account">Account</button><button class="text-button" data-action="logout">Log out</button></div></header>
      <main class="page-shell">
    <section data-view="dashboard" class="view"><div class="welcome-panel card"><div><span class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span><h2>Tend what matters today.</h2><p>Your small, local-first hub for projects, attention, and a little signal.</p></div><div class="garden-mark" aria-hidden="true">✿</div></div><div class="section-heading"><div><span class="eyebrow">Today</span><h2>Good soil for a start</h2></div></div><div class="briefing-grid"><article class="card briefing-card"><span class="card-icon">✓</span><div><span class="eyebrow">Open work</span><strong>${state.todos.filter((todo) => !todo.done).length} tasks</strong><p>Keep the next action visible.</p></div></article><article class="card briefing-card"><span class="card-icon">✦</span><div><span class="eyebrow">Attention</span><strong>${state.interests.length} interests</strong><p>Weighted by what you care about.</p></div></article></div><article class="card next-step"><div><span class="eyebrow">Suggested next step</span><h3>Grow your interest map</h3><p>Add a creator, topic, game, or keyword. Ratings help the engine prioritize future content.</p></div><button class="button" data-nav="interests">Review interests</button></article></section>
    <section data-view="todos" class="view" hidden><div class="section-heading"><div><span class="eyebrow">Shared todos</span><h2>What needs tending?</h2><p>Everyone can see the same list. Each task keeps its author and intended person visible.</p></div></div><form class="card todo-composer" id="todo-form"><div class="form-heading"><h3>Add a shared todo</h3><span class="eyebrow">Added by ${escapeHtml(currentUser.username)}</span></div><label>Task<input name="title" required maxlength="${APP_CONFIG.maxTodoTitleLength}" placeholder="What needs doing?" autocomplete="off"></label><div class="todo-form-fields"><label>Tags<input name="tags" maxlength="${APP_CONFIG.maxTodoTags * APP_CONFIG.maxTodoTagLength}" placeholder="home, urgent"></label><label>Project<select name="projectId"><option value="">No project</option>${state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join('')}</select></label><label>For<select name="assignedTo">${memberOptions()}</select></label></div><button class="button" type="submit">Add todo</button></form><div class="todo-toolbar card"><label>Search<input data-todo-filter="query" value="${escapeHtml(todoFilters.query)}" placeholder="Search todos or tags"></label><label>Status<select data-todo-filter="status"><option value="open" ${todoFilters.status === 'open' ? 'selected' : ''}>Open</option><option value="all" ${todoFilters.status === 'all' ? 'selected' : ''}>All</option><option value="completed" ${todoFilters.status === 'completed' ? 'selected' : ''}>Completed</option></select></label><label>Assigned to<select data-todo-filter="assignedTo"><option value="all">Everyone / anyone</option>${memberOptions(todoFilters.assignedTo)}</select></label></div><div class="todo-list-page">${todoCards()}</div></section>
    <section data-view="admin" class="view" hidden><div class="section-heading"><div><span class="eyebrow">Administration</span><h2>Keep the garden well tended.</h2><p>Admin tools are visible only while admin mode is active.</p></div></div><div class="admin-grid">${adminUserCards()}</div><form class="card admin-user-form" id="admin-user-form"><div class="form-heading"><h3>Add a user</h3><span class="eyebrow">Up to ${APP_CONFIG.maxAccounts} accounts</span></div><div class="admin-form-fields"><label>Username<input name="username" required minlength="3" maxlength="32" autocomplete="off"></label><label>Temporary password<input name="password" required minlength="4" maxlength="200" type="password" autocomplete="new-password"></label><label>Role<select name="role"><option value="user">User</option><option value="admin" selected>Administrator</option></select></label></div><button class="button" type="submit">Create account</button></form></section>
    <section data-view="interests" class="view" hidden><div class="section-heading"><div><span class="eyebrow">Interest Engine</span><h2>What feeds your curiosity?</h2><p>Ratings guide future content. You stay in control of the signal.</p></div></div><div class="interest-grid">${interestCards()}</div><article class="suggestions-panel"><div class="form-heading"><div><span class="eyebrow">Engine suggestions</span><h3>Branches worth exploring</h3></div><span class="eyebrow">Based on your map</span></div><div class="suggestion-grid">${suggestionCards()}</div></article><form class="card add-interest-form" id="add-interest-form"><div class="form-heading"><h3>Add an interest</h3><span class="eyebrow">Saved to your account</span></div><div class="form-fields"><label>Name<input name="name" required placeholder="e.g. cozy games"></label><label>Type<select name="category">${INTEREST_CATEGORIES.map((category) => `<option value="${category.id}">${category.label}</option>`).join('')}</select></label><label>Rating<select name="rating">${[1, 2, 3, 4, 5].map((rating) => `<option value="${rating}" ${rating === 3 ? 'selected' : ''}>${rating}/5</option>`).join('')}</select></label><button class="button" type="submit">Add interest</button></div></form><article class="card memory-panel"><div class="form-heading"><div><span class="eyebrow">Private memory</span><h3>What should the future assistant know?</h3></div><span class="eyebrow">Fully editable</span></div><p>Only memories saved here will be eligible as personal context for the assistant. You can edit or delete them at any time.</p><div class="memory-list">${memoryCards()}</div><form id="memory-form" class="memory-form"><textarea name="text" maxlength="500" required placeholder="Example: I prefer short, practical morning plans."></textarea><button class="button" type="submit">Save memory</button></form></article></section>
    <section data-view="games" class="view" hidden><div class="section-heading"><div><span class="eyebrow">Games</span><h2>Learn by playing.</h2><p>Small games can help the garden understand what you enjoy, one answer at a time.</p></div></div><div class="game-page">${getToKnowMeView()}${wordleView()}</div></section>
    <section data-view="projects" class="view" hidden><div class="section-heading"><div><span class="eyebrow">Projects</span><h2>Keep the garden growing.</h2><p>Only the next useful actions belong here for now.</p></div></div><div class="project-grid">${projectCards()}</div></section>
  </main><nav class="bottom-nav" aria-label="Primary navigation">${sections.map((item) => `<button data-nav="${item.id}" class="nav-item ${item.id === section ? 'is-selected' : ''}"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`).join('')}</nav><div id="modal-root"></div>${globalChatView()}`;
  setSection(section);
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => setSection(button.dataset.nav)));
  document.querySelector('[data-action="toggle-mode"]')?.addEventListener('change', async (event) => { viewMode = event.currentTarget.checked ? 'admin' : 'user'; if (viewMode === 'admin') adminUsers = await loadAdminUsers(); render(); setSection(viewMode === 'admin' ? 'admin' : 'dashboard'); });
  document.querySelectorAll('[data-action="toggle-chat"]').forEach((button) => button.addEventListener('click', () => { chatOpen = !chatOpen; if (chatOpen) chatUnreadCount = 0; const section = activeSection(); render(); setSection(section); }));
  document.querySelector('#chat-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const input = event.currentTarget.elements.message; try { const message = await sendChatMessage(input.value); chatMessages = [...chatMessages, message].slice(-APP_CONFIG.chatMaxMessages); input.value = ''; chatOpen = true; const section = activeSection(); render(); setSection(section); } catch (error) { window.alert(error.message); } });
  document.querySelector('[data-action="start-game"]')?.addEventListener('click', () => { state.games.getToKnowMe = startRound(state.games.getToKnowMe, state.interests); saveState(state); render(); setSection('games'); });
  document.querySelector('#wordle-form')?.addEventListener('submit', (event) => { event.preventDefault(); const input = event.currentTarget.elements.guess; try { state.games.wordle = submitWordleGuess(state.games.wordle, input.value, getDailyAnswer(new Date(`${state.games.wordle.date}T00:00:00Z`))); saveState(state); render(); setSection('games'); } catch (error) { window.alert(error.message); } });
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
  document.querySelector('#admin-user-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await createAdminUser(values); adminUsers = await loadAdminUsers(); render(); setSection('admin'); } catch (error) { window.alert(error.message); } });
}

function renderAuth(message = '') {
  root.innerHTML = `<main class="auth-shell"><section class="auth-card"><h1>The Mulch Garden</h1>${message ? `<p class="form-error">${escapeHtml(message)}</p>` : ''}<form id="auth-form"><label>Username<input name="username" required autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button class="button" type="submit">Sign in</button></form></section></main>`;
  document.querySelector('#auth-form').addEventListener('submit', async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); try { currentUser = await login(values.get('username'), values.get('password')); state = await loadState(); render(); } catch (error) { renderAuth(error.message); } });
}

function renderAccountSettings(message = '') {
  const summary = summarizePreferences(state.interests);
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="onboarding-modal card" role="dialog" aria-modal="true" aria-labelledby="account-title"><div class="modal-topline"><span class="eyebrow">Account settings</span><button class="text-button" data-action="close-account">Close</button></div><h2 id="account-title">Update your sign-in</h2><article class="account-summary"><span class="eyebrow">What we know about you</span><p>${escapeHtml(summary.text)}</p><span class="field-note">Based on your saved, editable interests.</span></article><p>Changing your username or password ends the current login after this update.</p>${message ? `<p class="form-error">${escapeHtml(message)}</p>` : ''}<form id="account-form" class="account-form"><label>Username<input name="username" required value="${escapeHtml(currentUser.username)}" autocomplete="username"></label><label>Current password<input name="currentPassword" type="password" required autocomplete="current-password"></label><label>New password <span class="field-note">leave blank to keep it</span><input name="newPassword" type="password" minlength="4" autocomplete="new-password"></label><button class="button" type="submit">Save changes</button></form></section></div>`;
  document.querySelector('[data-action="close-account"]').addEventListener('click', () => { document.querySelector('#modal-root').innerHTML = ''; });
  document.querySelector('#account-form').addEventListener('submit', async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); try { currentUser = await updateAccount(Object.fromEntries(values)); document.querySelector('#modal-root').innerHTML = ''; render(); } catch (error) { renderAccountSettings(error.message); } });
}

async function init() {
  try { currentUser = await getCurrentUser(); if (!currentUser) { renderAuth(); return; } viewMode = isAdmin() ? 'admin' : 'user'; members = await loadMembers().catch(() => [{ id: currentUser.id, username: currentUser.username }]); chatMessages = (await loadChatMessages().catch(() => [])).slice(-APP_CONFIG.chatMaxMessages); chatUnreadCount = 0; if (isAdminMode()) adminUsers = await loadAdminUsers().catch(() => []); state = await loadState(); state = { ...state, interests: Array.isArray(state.interests) ? state.interests : [], projects: Array.isArray(state.projects) ? state.projects : [], memories: Array.isArray(state.memories) ? state.memories : [], feedback: Array.isArray(state.feedback) ? state.feedback : [], games: state.games && state.games.getToKnowMe ? { ...state.games, wordle: resetWordleForDate(state.games.wordle, getWordleDate()) } : { getToKnowMe: createGetToKnowMeState(), wordle: createWordleState() } }; const legacyTodos = state.projects.flatMap((project) => (Array.isArray(project.todos) ? project.todos.map((todo) => normalizeTodo(todo, project.id)) : [])); state.todos = Array.isArray(state.todos) && state.todos.length ? state.todos.map((todo) => normalizeTodo(todo)) : legacyTodos; render(); startChatPolling(); }
  catch (error) { renderAuth(error.message); }
}

init();
