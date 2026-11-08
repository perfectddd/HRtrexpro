import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDefaults, DEFAULT_SETTINGS, boundsError } from '../js/settings-defaults.js';

test('boundsError accepts ascending positive bounds', () => {
  assert.equal(boundsError([50, 60, 70, 80, 90, 100]), null);
});

test('boundsError rejects non-ascending, zero or NaN bounds', () => {
  assert.ok(boundsError([50, 60, 60, 80, 90, 100]));
  assert.ok(boundsError([50, 70, 60, 80, 90, 100]));
  assert.ok(boundsError([0, 60, 70, 80, 90, 100]));
  assert.ok(boundsError([50, NaN, 70, 80, 90, 100]));
});

test('withDefaults fills missing alert keys and keeps stored values', () => {
  const s = withDefaults({ age: 45, alerts: { zoneChange: { sound: false } } });
  assert.equal(s.age, 45);
  assert.deepEqual(s.alerts.zoneChange, { sound: false, vibrate: true, flash: true });
  assert.deepEqual(s.alerts.belowTarget, { sound: true, vibrate: true, flash: true });
  assert.deepEqual(s.zoneBounds, [50, 60, 70, 80, 90, 100]);
});

test('withDefaults does not share arrays with DEFAULT_SETTINGS', () => {
  const s = withDefaults();
  s.zoneBounds[0] = 1;
  s.alerts.countdown.sound = false;
  assert.equal(DEFAULT_SETTINGS.zoneBounds[0], 50);
  assert.equal(DEFAULT_SETTINGS.alerts.countdown.sound, true);
});
