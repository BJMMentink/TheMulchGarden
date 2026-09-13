import { APP_CONFIG } from './config.js';

export const TODO_ASSIGNMENT_EVERYONE = 'everyone';

export function normalizeTags(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map((tag) => String(tag).trim().slice(0, APP_CONFIG.maxTodoTagLength)).filter(Boolean))].slice(0, APP_CONFIG.maxTodoTags);
}

export function createTodo({ title, tags = [], projectId = null, addedBy = 'system', assignedTo = TODO_ASSIGNMENT_EVERYONE, now = new Date().toISOString() }) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) throw new Error('Todo title is required.');
  if (cleanTitle.length > APP_CONFIG.maxTodoTitleLength) throw new Error(`Todo titles must be ${APP_CONFIG.maxTodoTitleLength} characters or fewer.`);
  return { id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: cleanTitle, done: false, projectId: projectId || null, tags: normalizeTags(tags), addedBy: String(addedBy || 'system'), assignedTo: String(assignedTo || TODO_ASSIGNMENT_EVERYONE), createdAt: now, updatedAt: now };
}

export function normalizeTodo(todo, fallbackProjectId = null) {
  return { ...todo, id: String(todo.id), title: String(todo.title || '').trim(), done: Boolean(todo.done), projectId: todo.projectId || fallbackProjectId || null, tags: normalizeTags(todo.tags), addedBy: String(todo.addedBy || 'system'), assignedTo: String(todo.assignedTo || TODO_ASSIGNMENT_EVERYONE), createdAt: todo.createdAt || new Date().toISOString(), updatedAt: todo.updatedAt || todo.createdAt || new Date().toISOString() };
}

export function filterTodos(todos, { query = '', status = 'open', assignedTo = 'all' } = {}) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  return todos.filter((todo) => {
    const matchesQuery = !normalizedQuery || [todo.title, ...(todo.tags || [])].some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
    const matchesStatus = status === 'all' || (status === 'completed' ? todo.done : !todo.done);
    const matchesAssignee = assignedTo === 'all' || todo.assignedTo === assignedTo;
    return matchesQuery && matchesStatus && matchesAssignee;
  });
}
