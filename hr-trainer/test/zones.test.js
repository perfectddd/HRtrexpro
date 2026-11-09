import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hrMaxFor, zoneFor, pctOfMax, ZoneDetector, ZONE_COLORS, ZONE_PRESETS, isHexColor, zoneLabel } from '../js/zones.js';
import { DEFAULT_SETTINGS } from '../js/settings-defaults.js';

const B = [50, 60, 70, 80, 90, 100];

test('hrMaxFor uses age unless manual', () => {
  assert.equal(hrMaxFor({ age: 40, hrMax: 999, hrMaxManual: false }), 180);
  assert.equal(hrMaxFor({ age: 40, hrMax: 195, hrMaxManual: true }), 195);
});

test('zoneFor boundaries at hrMax 200', () => {
  const cases = [[99, 0], [100, 1], [139, 2], [140, 3], [179, 4], [180, 5], [200, 5], [230, 5]];
  for (const [bpm, z] of cases) assert.equal(zoneFor(bpm, 200, B), z, `bpm ${bpm}`);
});

test('pctOfMax rounds', () => {
  assert.equal(pctOfMax(150, 190), 79);
});

test('detector: first update sets current without event', () => {
  const d = new ZoneDetector();
  assert.equal(d.update(3, 0), null);
  assert.equal(d.current, 3);
});

test('detector emits once after hold', () => {
  const d = new ZoneDetector();
  d.update(3, 0);
  assert.equal(d.update(4, 1000), null);
  assert.equal(d.update(4, 3999), null);
  assert.deepEqual(d.update(4, 4000), { from: 3, to: 4 });
  assert.equal(d.update(4, 5000), null);
  assert.equal(d.current, 4);
});

test('flapping across a boundary never emits', () => {
  const d = new ZoneDetector();
  d.update(3, 0);
  for (let t = 1000; t <= 20000; t += 1000) {
    assert.equal(d.update(t % 2000 ? 4 : 3, t), null);
  }
  assert.equal(d.current, 3);
});

test('defaults and colors', () => {
  assert.deepEqual(DEFAULT_SETTINGS.zoneBounds, B);
  assert.equal(DEFAULT_SETTINGS.zoneHighRepeatSec, 10);
  for (const k of ['countdown', 'stepChange', 'zoneChange', 'zoneHigh', 'belowTarget', 'disconnect']) {
    assert.deepEqual(DEFAULT_SETTINGS.alerts[k], { sound: true, vibrate: true, flash: true });
  }
  assert.deepEqual(ZONE_COLORS, ['#2a313c', '#94a3b8', '#38bdf8', '#34d399', '#fbbf24', '#fb7185']);
});

test('zoneLabel gives Thai and English names', () => {
  assert.deepEqual(zoneLabel(1), { code: 'Z1', th: 'วอร์มอัพ', en: 'Warm-up' });
  assert.deepEqual(zoneLabel(2), { code: 'Z2', th: 'เผาผลาญไขมัน', en: 'Fat burn' });
  assert.deepEqual(zoneLabel(3), { code: 'Z3', th: 'แอโรบิก', en: 'Aerobic' });
  assert.deepEqual(zoneLabel(4), { code: 'Z4', th: 'แอนแอโรบิก', en: 'Anaerobic' });
  assert.deepEqual(zoneLabel(5), { code: 'Z5', th: 'สูงสุด', en: 'Maximum' });
  assert.deepEqual(zoneLabel(0), { code: '', th: 'ต่ำกว่า Zone 1', en: 'Below zone 1' });
});

test('zone colour presets: soft (default), classic, earth', () => {
  assert.deepEqual(Object.keys(ZONE_PRESETS), ['soft', 'classic', 'earth']);
  assert.deepEqual(ZONE_PRESETS.soft.colors, ZONE_COLORS);
  assert.deepEqual(ZONE_PRESETS.classic.colors, ['#424242', '#9e9e9e', '#2196f3', '#4caf50', '#ff9800', '#f44336']);
  for (const p of Object.values(ZONE_PRESETS)) {
    assert.equal(p.colors.length, 6);
    assert.ok(p.colors.every(isHexColor), p.label);
    assert.ok(p.label);
  }
});
