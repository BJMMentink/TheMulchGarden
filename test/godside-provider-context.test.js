import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getGodseyeProviderKey,
  getGodseyeProviderUserId,
  withGodseyeProviderContext,
} from '../src/godside-provider-context.js';

test('provider keys stay isolated to each asynchronous member request', async () => {
  const previous = process.env.TOMTOM_API_KEY;
  process.env.TOMTOM_API_KEY = 'shared-fallback-must-not-leak';
  try {
    assert.equal(getGodseyeProviderKey('TOMTOM_API_KEY'), 'shared-fallback-must-not-leak');
    const [first, second, missing] = await Promise.all([
      withGodseyeProviderContext(
        { userId: 'member-one', keys: { TOMTOM_API_KEY: 'member-one-key' } },
        async () => {
          await Promise.resolve();
          return [getGodseyeProviderUserId(), getGodseyeProviderKey('TOMTOM_API_KEY')];
        },
      ),
      withGodseyeProviderContext(
        { userId: 'member-two', keys: { TOMTOM_API_KEY: 'member-two-key' } },
        async () => {
          await Promise.resolve();
          return [getGodseyeProviderUserId(), getGodseyeProviderKey('TOMTOM_API_KEY')];
        },
      ),
      withGodseyeProviderContext(
        { userId: 'member-three', keys: { TOMTOM_API_KEY: '' } },
        async () => {
          await Promise.resolve();
          return getGodseyeProviderKey('TOMTOM_API_KEY');
        },
      ),
    ]);

    assert.deepEqual(first, ['member-one', 'member-one-key']);
    assert.deepEqual(second, ['member-two', 'member-two-key']);
    assert.equal(missing, '');
  } finally {
    if (previous === undefined) delete process.env.TOMTOM_API_KEY;
    else process.env.TOMTOM_API_KEY = previous;
  }
});
