import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowChatTimestamp } from '../src/chat-engine.js';

test('chat timestamps appear for the first message and long gaps only', () => {
  const messages = [
    { createdAt: '2026-09-13T10:00:00.000Z' },
    { createdAt: '2026-09-13T10:05:00.000Z' },
    { createdAt: '2026-09-13T10:40:00.000Z' },
  ];
  assert.equal(shouldShowChatTimestamp(messages, 0, 30 * 60 * 1000), true);
  assert.equal(shouldShowChatTimestamp(messages, 1, 30 * 60 * 1000), false);
  assert.equal(shouldShowChatTimestamp(messages, 2, 30 * 60 * 1000), true);
});
