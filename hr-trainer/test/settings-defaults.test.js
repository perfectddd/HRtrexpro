import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDefaults, DEFAULT_SETTINGS, boundsError } from '../js/settings-defaults.js';
import { ZONE_COLORS, zoneColorFor, textColorFor } from '../js/zones.js';

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

test('defaults include an empty auth key and crypt flag on', () => {
  const s = withDefaults();
  assert.equal(s.authKey, '');
  assert.equal(s.authCrypt, true);
  assert.equal(withDefaults({ authCrypt: false }).authCrypt, false);
});

test('zone colors default to the built-in palette and can be overridden', () => {
  const s = withDefaults();
  assert.equal(s.zoneColors.length, 6);
  assert.equal(s.zoneColors[0], ZONE_COLORS[0]);
  const custom = withDefaults({ zoneColors: ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555'] });
  assert.equal(custom.zoneColors[3], '#333333');
});

test('invalid stored zone colors fall back per slot', () => {
  const s = withDefaults({ zoneColors: ['#000000', 'red', null, '#33', '#444444'] });
  assert.equal(s.zoneColors[0], '#000000');
  assert.equal(s.zoneColors[1], ZONE_COLORS[1]);
  assert.equal(s.zoneColors[2], ZONE_COLORS[2]);
  assert.equal(s.zoneColors[3], ZONE_COLORS[3]);
  assert.equal(s.zoneColors[4], '#444444');
  assert.equal(s.zoneColors[5], ZONE_COLORS[5]);
});

test('zoneColorFor picks the settings palette, falling back to defaults', () => {
  const s = withDefaults({ zoneColors: ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555'] });
  assert.equal(zoneColorFor(4, s), '#444444');
  assert.equal(zoneColorFor(4, {}), ZONE_COLORS[4]);
  assert.equal(zoneColorFor(9, s), ZONE_COLORS[0]);
});

test('textColorFor picks dark text on light backgrounds', () => {
  assert.equal(textColorFor('#ffffff'), '#111111');
  assert.equal(textColorFor('#ffd54f'), '#111111');
  assert.equal(textColorFor('#1e3a5f'), '#ffffff');
  assert.equal(textColorFor('#e53935'), '#ffffff');
});

test('withDefaults does not share arrays with DEFAULT_SETTINGS', () => {
  const s = withDefaults();
  s.zoneBounds[0] = 1;
  s.alerts.countdown.sound = false;
  assert.equal(DEFAULT_SETTINGS.zoneBounds[0], 50);
  assert.equal(DEFAULT_SETTINGS.alerts.countdown.sound, true);
});
