import assert from 'node:assert/strict';
import test from 'node:test';
import { cycleAdminGroupIndex, findAdminGroupIndex, resolveAdminGroupView } from '../src/admin-navigation.js';

const groups = [
  { id: 'home', views: ['landing', 'portfolio', 'about'] },
  { id: 'work', views: ['board', 'requests', 'mcp'] },
];
const availableViews = ['landing', 'portfolio', 'about', 'board', 'requests', 'mcp', 'account'];

test('finds the section containing a page and leaves ungrouped pages ungrouped', () => {
  assert.equal(findAdminGroupIndex(groups, 'about'), 0);
  assert.equal(findAdminGroupIndex(groups, 'board'), 1);
  assert.equal(findAdminGroupIndex(groups, 'account'), -1);
});

test('cycles sections in both directions and wraps around', () => {
  assert.equal(cycleAdminGroupIndex(groups, 0, 1), 1);
  assert.equal(cycleAdminGroupIndex(groups, 1, 1), 0);
  assert.equal(cycleAdminGroupIndex(groups, 0, -1), 1);
});

test('restores a saved page within its own section and defaults Work to Board', () => {
  assert.equal(resolveAdminGroupView(groups[0], 'about', availableViews), 'about');
  assert.equal(resolveAdminGroupView(groups[1], null, availableViews), 'board');
  assert.equal(resolveAdminGroupView(groups[1], 'about', availableViews), 'board');
});

test('uses the first remaining page when a remembered page no longer exists', () => {
  const updatedHome = { id: 'home', views: ['landing', 'portfolio'] };
  assert.equal(resolveAdminGroupView(updatedHome, 'about', availableViews), 'landing');
  assert.equal(resolveAdminGroupView(groups[1], 'board', ['landing', 'requests', 'mcp']), 'requests');
});
