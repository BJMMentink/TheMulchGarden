import test from 'node:test';
import assert from 'node:assert/strict';
import { createTodo, filterTodos, normalizeTags, TODO_ASSIGNMENT_EVERYONE } from '../src/todo-engine.js';

test('createTodo creates a shared todo with author, assignee, project, and tags', () => {
  const todo = createTodo({ title: '  Plan the lesson  ', tags: 'art, urgent, art', projectId: 'project-gmche', addedBy: 'user-ben', assignedTo: TODO_ASSIGNMENT_EVERYONE, now: '2026-01-01T00:00:00.000Z' });
  assert.equal(todo.title, 'Plan the lesson');
  assert.deepEqual(todo.tags, ['art', 'urgent']);
  assert.equal(todo.addedBy, 'user-ben');
  assert.equal(todo.assignedTo, 'everyone');
  assert.equal(todo.projectId, 'project-gmche');
});

test('normalizeTags removes blanks, duplicates, and excess length', () => {
  assert.deepEqual(normalizeTags('home, , home, planning'), ['home', 'planning']);
});

test('filterTodos supports open/completed, assignee, and text/tag filters', () => {
  const todos = [
    { title: 'Buy soil', tags: ['garden'], done: false, assignedTo: 'everyone' },
    { title: 'Send lesson plan', tags: ['work'], done: true, assignedTo: 'user-ben' },
  ];
  assert.equal(filterTodos(todos).length, 1);
  assert.equal(filterTodos(todos, { status: 'completed', assignedTo: 'user-ben' })[0].title, 'Send lesson plan');
  assert.equal(filterTodos(todos, { query: 'garden', status: 'all' })[0].title, 'Buy soil');
});
