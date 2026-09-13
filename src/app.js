import { APP_CONFIG, INTEREST_CATEGORIES, ONBOARDING_STEPS, SECTIONS } from './config.js';
import { createInterest, suggestInterestCandidates } from './interest-engine.js';
import { getCurrentUser, loadState, login, logout, saveState, updateAccount } from './storage.js';

let state;
let currentUser;
const root = document.querySelector('#app');

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character]);
}

function stars(rating) {
  return Array.from({ length: APP_CONFIG.maxInterestRating }, (_, index) => index < rating ? '★' : '☆').join('');
}

function activeSection() {
  return document.querySelector('[data-section].is-active')?.dataset.section || APP_CONFIG.defaultSection;
}

function setSection(section) {
  document.querySelectorAll('[data-section]').forEach((element) => element.classList.toggle('is-active', element.dataset.section === section));
  document.querySelectorAll('[data-view]').forEach((element) => element.hidden = element.dataset.view !== section);
  document.querySelectorAll('[data-nav]').forEach((element) => element.classList.toggle('is-selected', element.dataset.nav === section));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function interestCards() {
  return state.interests.map((interest) => `<article class="interest-card card"><div><span class="eyebrow">${escapeHtml(interest.category)}</span><h3>${escapeHtml(interest.name)}</h3><div class="interest-actions"><button class="text-button" data-edit-interest="${interest.id}">Edit</button><button class="text-button danger" data-remove-interest="${interest.id}">Remove</button></div></div><div class="rating" aria-label="${interest.rating} out of 5">${stars(interest.rating)}</div></article>`).join('');
}

function suggestionCards() {
  const suggestions = suggestInterestCandidates(state.interests);
  if (!suggestions.length) return '<article class="card empty-state"><h3>Your map is broad for now.</h3><p>Add another interest and the engine will look for new connections.</p></article>';
  return suggestions.map((suggestion) => `<article class="suggestion-card card"><div><span class="eyebrow">${escapeHtml(suggestion.category)}</span><h3>${escapeHtml(suggestion.name)}</h3><p>${escapeHtml(suggestion.reason)}</p></div><button class="button button-quiet" data-add-suggestion="${escapeHtml(suggestion.name)}" data-suggestion-category="${suggestion.category}">Add</button></article>`).join('');
}

function memoryCards() {
  if (!state.memories.length) return '<p class="empty-copy">No saved memories yet. Add only what you want the future assistant to know.</p>';
  return state.memories.map((memory) => `<div class="memory-row"><textarea data-memory-input="${memory.id}" maxlength="500">${escapeHtml(memory.text)}</textarea><div class="memory-actions"><button class="button button-quiet" data-save-memory="${memory.id}">Save</button><button class="text-button danger" data-remove-memory="${memory.id}">Delete</button></div></div>`).join('');
}

function projectCards() {
  return state.projects.map((project) => {
    const openTodos = project.todos.filter((todo) => !todo.done).length;
    return `<article class="project-card card"><div class="project-heading"><div><span class="project-dot ${project.color}"></span><span class="eyebrow">${escapeHtml(project.type)}</span><h3>${escapeHtml(project.name)}</h3></div><span class="count-badge">${openTodos} open</span></div><div class="todo-list">${project.todos.map((todo) => `<label class="todo-row"><input type="checkbox" data-todo="${todo.id}" data-project="${project.id}" ${todo.done ? 'checked' : ''}><span class="${todo.done ? 'done' : ''}">${escapeHtml(todo.title)}</span></label>`).join('')}</div><form class="inline-form" data-add-todo="${project.id}"><input name="title" maxlength="${APP_CONFIG.maxTodoTitleLength}" placeholder="Add a task" aria-label="Add task to ${escapeHtml(project.name)}"><button class="button button-quiet" type="submit">Add</button></form></article>`;
  }).join('');
}

function render() {
  root.innerHTML = `<header class="topbar"><div><p class="eyebrow">${escapeHtml(currentUser.username)} · Personal command center</p><h1>The Mulch Garden</h1></div><div class="topbar-actions"><button class="text-button" data-action="account">Account</button><button class="text-button" data-action="logout">Log out</button><button class="icon-button" data-action="open-onboarding" aria-label="Open onboarding">＋</button></div></header>
  <main class="page-shell">
    <section data-view="dashboard" class="view"><div class="welcome-panel card"><div><span class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span><h2>Tend what matters today.</h2><p>Your small, local-first hub for projects, attention, and a little signal.</p></div><div class="garden-mark" aria-hidden="true">✿</div></div><div class="section-heading"><div><span class="eyebrow">Today</span><h2>Good soil for a start</h2></div></div><div class="briefing-grid"><article class="card briefing-card"><span class="card-icon">✓</span><div><span class="eyebrow">Open work</span><strong>${state.projects.reduce((total, project) => total + project.todos.filter((todo) => !todo.done).length, 0)} tasks</strong><p>Keep the next action visible.</p></div></article><article class="card briefing-card"><span class="card-icon">✦</span><div><span class="eyebrow">Attention</span><strong>${state.interests.length} interests</strong><p>Weighted by what you care about.</p></div></article></div><article class="card next-step"><div><span class="eyebrow">Suggested next step</span><h3>Grow your interest map</h3><p>Add a creator, topic, game, or keyword. Ratings help the engine prioritize future content.</p></div><button class="button" data-nav="interests">Review interests</button></article></section>
    <section data-view="interests" class="view" hidden><div class="section-heading"><div><span class="eyebrow">Interest Engine</span><h2>What feeds your curiosity?</h2><p>Ratings guide future content. You stay in control of the signal.</p></div></div><div class="interest-grid">${interestCards()}</div><article class="suggestions-panel"><div class="form-heading"><div><span class="eyebrow">Engine suggestions</span><h3>Branches worth exploring</h3></div><span class="eyebrow">Based on your map</span></div><div class="suggestion-grid">${suggestionCards()}</div></article><form class="card add-interest-form" id="add-interest-form"><div class="form-heading"><h3>Add an interest</h3><span class="eyebrow">Saved to your account</span></div><div class="form-fields"><label>Name<input name="name" required placeholder="e.g. cozy games"></label><label>Type<select name="category">${INTEREST_CATEGORIES.map((category) => `<option value="${category.id}">${category.label}</option>`).join('')}</select></label><label>Rating<select name="rating">${[1, 2, 3, 4, 5].map((rating) => `<option value="${rating}" ${rating === 3 ? 'selected' : ''}>${rating}/5</option>`).join('')}</select></label><button class="button" type="submit">Add interest</button></div></form><article class="card memory-panel"><div class="form-heading"><div><span class="eyebrow">Private memory</span><h3>What should the future assistant know?</h3></div><span class="eyebrow">Fully editable</span></div><p>Only memories saved here will be eligible as personal context for the assistant. You can edit or delete them at any time.</p><div class="memory-list">${memoryCards()}</div><form id="memory-form" class="memory-form"><textarea name="text" maxlength="500" required placeholder="Example: I prefer short, practical morning plans."></textarea><button class="button" type="submit">Save memory</button></form></article></section>
    <section data-view="projects" class="view" hidden><div class="section-heading"><div><span class="eyebrow">Projects</span><h2>Keep the garden growing.</h2><p>Only the next useful actions belong here for now.</p></div></div><div class="project-grid">${projectCards()}</div></section>
  </main><nav class="bottom-nav" aria-label="Primary navigation">${SECTIONS.map((section) => `<button data-nav="${section.id}" class="nav-item ${section.id === activeSection() ? 'is-selected' : ''}"><span class="nav-icon">${section.icon}</span><span>${section.label}</span></button>`).join('')}</nav><div id="modal-root"></div>`;
  setSection(activeSection());
  bindEvents();
  if (!state.onboarding.completed) renderOnboarding(0, {});
}

function renderOnboarding(stepIndex, selections) {
  const step = ONBOARDING_STEPS[stepIndex];
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="onboarding-modal card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title"><div class="progress-line"><span style="width: ${((stepIndex + 1) / ONBOARDING_STEPS.length) * 100}%"></span></div><div class="modal-topline"><span class="eyebrow">Set up your signal · ${stepIndex + 1} of ${ONBOARDING_STEPS.length}</span><button class="text-button" data-action="skip-onboarding">Skip for now</button></div><h2 id="onboarding-title">${step.title}</h2><p>${step.prompt}</p><div class="choice-grid">${step.options.map((option) => `<button class="choice ${selections[option] ? 'is-chosen' : ''}" data-choice="${escapeHtml(option)}"><span>${escapeHtml(option)}</span><span class="choice-check">${selections[option] ? '✓' : '+'}</span></button>`).join('')}</div><div class="modal-actions"><button class="button button-quiet" data-action="onboarding-back" ${stepIndex === 0 ? 'disabled' : ''}>Back</button><button class="button" data-action="onboarding-next">${isLast ? 'Finish setup' : 'Continue'}</button></div></section></div>`;
  document.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => { selections[button.dataset.choice] = !selections[button.dataset.choice]; button.classList.toggle('is-chosen', selections[button.dataset.choice]); button.querySelector('.choice-check').textContent = selections[button.dataset.choice] ? '✓' : '+'; }));
  document.querySelector('[data-action="onboarding-next"]').addEventListener('click', () => {
    Object.entries(selections).filter(([, selected]) => selected).forEach(([name]) => { if (!state.interests.some((interest) => interest.name.toLocaleLowerCase() === name.toLocaleLowerCase())) state.interests.push(createInterest({ name, category: step.category, rating: step.category === 'creator' ? 5 : 3, source: 'onboarding' })); });
    if (isLast) { state.onboarding = { completed: true, version: APP_CONFIG.onboardingVersion }; saveState(state); render(); return; }
    renderOnboarding(stepIndex + 1, {});
  });
  document.querySelector('[data-action="skip-onboarding"]').addEventListener('click', () => { state.onboarding = { completed: true, version: APP_CONFIG.onboardingVersion }; saveState(state); render(); });
  document.querySelector('[data-action="onboarding-back"]').addEventListener('click', () => { if (stepIndex > 0) renderOnboarding(stepIndex - 1, {}); });
}

function bindEvents() {
  document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => setSection(button.dataset.nav)));
  document.querySelector('[data-action="open-onboarding"]')?.addEventListener('click', () => renderOnboarding(0, {}));
  document.querySelector('[data-action="account"]')?.addEventListener('click', () => renderAccountSettings());
  document.querySelector('[data-action="logout"]')?.addEventListener('click', async () => { await logout(); currentUser = null; state = null; renderAuth(); });
  document.querySelector('#add-interest-form')?.addEventListener('submit', (event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); try { state.interests.push(createInterest({ name: formData.get('name'), category: formData.get('category'), rating: formData.get('rating') })); saveState(state); render(); setSection('interests'); } catch (error) { window.alert(error.message); } });
  document.querySelectorAll('[data-add-suggestion]').forEach((button) => button.addEventListener('click', () => { state.interests.push(createInterest({ name: button.dataset.addSuggestion, category: button.dataset.suggestionCategory, rating: 3, source: 'suggestion' })); saveState(state); render(); setSection('interests'); }));
  document.querySelectorAll('[data-remove-interest]').forEach((button) => button.addEventListener('click', () => { if (!window.confirm('Remove this interest?')) return; state.interests = state.interests.filter((interest) => interest.id !== button.dataset.removeInterest); saveState(state); render(); setSection('interests'); }));
  document.querySelectorAll('[data-edit-interest]').forEach((button) => button.addEventListener('click', () => { const interest = state.interests.find((item) => item.id === button.dataset.editInterest); if (!interest) return; const name = window.prompt('Interest name', interest.name)?.trim(); if (!name) return; const rating = window.prompt('Rating from 1 to 5', String(interest.rating)); if (rating === null) return; interest.name = name; interest.rating = Math.min(APP_CONFIG.maxInterestRating, Math.max(APP_CONFIG.minInterestRating, Math.round(Number(rating) || interest.rating))); saveState(state); render(); setSection('interests'); }));
  document.querySelector('#memory-form')?.addEventListener('submit', (event) => { event.preventDefault(); const text = new FormData(event.currentTarget).get('text')?.trim(); if (!text) return; state.memories.push({ id: `memory-${Date.now()}`, text, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); saveState(state); render(); setSection('interests'); });
  document.querySelectorAll('[data-save-memory]').forEach((button) => button.addEventListener('click', () => { const memory = state.memories.find((item) => item.id === button.dataset.saveMemory); const input = document.querySelector(`[data-memory-input="${button.dataset.saveMemory}"]`); if (memory && input?.value.trim()) { memory.text = input.value.trim(); memory.updatedAt = new Date().toISOString(); saveState(state); render(); setSection('interests'); } }));
  document.querySelectorAll('[data-remove-memory]').forEach((button) => button.addEventListener('click', () => { state.memories = state.memories.filter((memory) => memory.id !== button.dataset.removeMemory); saveState(state); render(); setSection('interests'); }));
  document.querySelectorAll('[data-todo]').forEach((input) => input.addEventListener('change', () => { const project = state.projects.find((item) => item.id === input.dataset.project); const todo = project?.todos.find((item) => item.id === input.dataset.todo); if (todo) todo.done = input.checked; saveState(state); render(); setSection('projects'); }));
  document.querySelectorAll('[data-add-todo]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); const title = new FormData(form).get('title')?.trim(); const project = state.projects.find((item) => item.id === form.dataset.addTodo); if (title && project) { project.todos.push({ id: `todo-${Date.now()}`, title, done: false }); saveState(state); render(); setSection('projects'); } }));
}

function renderAuth(message = '') {
  root.innerHTML = `<main class="auth-shell"><section class="auth-card"><h1>The Mulch Garden</h1>${message ? `<p class="form-error">${escapeHtml(message)}</p>` : ''}<form id="auth-form"><label>Username<input name="username" required autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button class="button" type="submit">Sign in</button></form></section></main>`;
  document.querySelector('#auth-form').addEventListener('submit', async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); try { currentUser = await login(values.get('username'), values.get('password')); state = await loadState(); render(); } catch (error) { renderAuth(error.message); } });
}

function renderAccountSettings(message = '') {
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="onboarding-modal card" role="dialog" aria-modal="true" aria-labelledby="account-title"><div class="modal-topline"><span class="eyebrow">Account settings</span><button class="text-button" data-action="close-account">Close</button></div><h2 id="account-title">Update your sign-in</h2><p>Changing your username or password ends the current login after this update.</p>${message ? `<p class="form-error">${escapeHtml(message)}</p>` : ''}<form id="account-form" class="account-form"><label>Username<input name="username" required value="${escapeHtml(currentUser.username)}" autocomplete="username"></label><label>Current password<input name="currentPassword" type="password" required autocomplete="current-password"></label><label>New password <span class="field-note">leave blank to keep it</span><input name="newPassword" type="password" minlength="4" autocomplete="new-password"></label><button class="button" type="submit">Save changes</button></form></section></div>`;
  document.querySelector('[data-action="close-account"]').addEventListener('click', () => { document.querySelector('#modal-root').innerHTML = ''; });
  document.querySelector('#account-form').addEventListener('submit', async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); try { currentUser = await updateAccount(Object.fromEntries(values)); document.querySelector('#modal-root').innerHTML = ''; render(); } catch (error) { renderAccountSettings(error.message); } });
}

async function init() {
  try { currentUser = await getCurrentUser(); if (!currentUser) { renderAuth(); return; } state = await loadState(); state = { ...state, interests: Array.isArray(state.interests) ? state.interests : [], projects: Array.isArray(state.projects) ? state.projects : [], memories: Array.isArray(state.memories) ? state.memories : [], feedback: Array.isArray(state.feedback) ? state.feedback : [] }; render(); }
  catch (error) { renderAuth(error.message); }
}

init();
