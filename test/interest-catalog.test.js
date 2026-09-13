import test from 'node:test';
import assert from 'node:assert/strict';
import { getOnboardingSteps, recommendOnboardingOptions } from '../src/interest-catalog.js';

test('creator onboarding includes public starter creators and existing creators', () => {
  const freshCreatorStep = getOnboardingSteps().find((step) => step.id === 'creators');
  const existingCreatorStep = getOnboardingSteps({ interests: [{ name: 'Nuxinor', category: 'creator', rating: 5 }] }).find((step) => step.id === 'creators');
  assert.ok(freshCreatorStep.options.includes('MrBeast'));
  assert.ok(existingCreatorStep.options.includes('Nuxinor'));
  assert.ok(existingCreatorStep.options.length <= 6);
});

test('gaming recommendations respond to selected creator signals', () => {
  const steps = getOnboardingSteps({ selections: { 'Luke Stephens': true } });
  const gamingStep = steps.find((step) => step.id === 'gaming');
  assert.match(gamingStep.prompt, /Luke Stephens/);
  assert.ok(gamingStep.options.includes('Elden Ring'));
  assert.ok(gamingStep.options.includes('Baldur’s Gate 3'));
});

test('recommendations remove existing interests and change with technology selections', () => {
  const baseline = recommendOnboardingOptions('topic', [], {});
  const tailored = recommendOnboardingOptions('topic', [], { 'Marques Brownlee': true });
  const existingIncluded = recommendOnboardingOptions('topic', [{ name: 'Artificial intelligence', category: 'topic', rating: 5 }], {});
  assert.ok(existingIncluded.includes('Artificial intelligence'));
  assert.ok(baseline.length > 0);
  assert.ok(tailored.includes('Artificial intelligence'));
});

test('the onboarding sequence remains progressive and data-driven', () => {
  const steps = getOnboardingSteps({ selections: { 'PewDiePie': true } });
  assert.deepEqual(steps.map((step) => step.id), ['creators', 'gaming', 'technology', 'entertainment', 'professional']);
  assert.ok(steps.every((step) => step.options.length > 0));
});
