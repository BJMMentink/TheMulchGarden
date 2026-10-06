import assert from 'node:assert/strict';
import test from 'node:test';
import { renderGodsidePanel } from '../src/godside.js';

test('Godside page embeds the complete app and explains its keys and controls below it', () => {
  const panel = renderGodsidePanel();
  assert.match(panel, /data-godside-globe/);
  assert.match(panel, /allow="microphone"/);
  assert.match(panel, /<details class="godside-guide-section">\s*<summary><span>Keys<\/span>/);
  assert.match(panel, /<span>How it works<\/span>/);
  assert.match(panel, /<span>Free vs\. keyed data<\/span>/);
  assert.equal((panel.match(/<details class="godside-guide-section(?: godside-guide-section-wide)?">/g) || []).length, 3);
  assert.doesNotMatch(panel, /<details[^>]*\bname=/);
  assert.match(panel, /Google Maps/);
  assert.match(panel, /OpenSky/);
  assert.match(panel, /ADSB\.lol regional feed/);
  assert.match(panel, /not all wired into the hosted app yet/);
  assert.match(panel, /left-side data\/layer controls/);
  assert.doesNotMatch(panel, /Your keys, your account|LOCAL APP|MEMBER ACCESS|data-godside-key-form/);
});
