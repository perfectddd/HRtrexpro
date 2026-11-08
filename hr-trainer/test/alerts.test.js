import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertPlan, TargetMonitor } from '../js/alerts.js';
import { withDefaults } from '../js/settings-defaults.js';

test('work start plan', () => {
  assert.deepEqual(alertPlan({ type: 'stepStart', kind: 'work' }, withDefaults()), {
    sound: 'workStart', vibrate: [400], flash: '#ff9800',
  });
});

test('rest start plan', () => {
  assert.deepEqual(alertPlan({ type: 'stepStart', kind: 'rest' }, withDefaults()), {
    sound: 'restStart', vibrate: [150, 100, 150], flash: '#2196f3',
  });
});

test('other step kinds: sound but no flash', () => {
  const p = alertPlan({ type: 'stepStart', kind: 'cooldown' }, withDefaults());
  assert.equal(p.sound, 'workStart');
  assert.equal(p.flash, null);
});

test('event mapping for the rest of the table', () => {
  const st = withDefaults();
  assert.deepEqual(alertPlan({ type: 'countdown', n: 3 }, st), { sound: 'tick', vibrate: null, flash: null });
  assert.equal(alertPlan({ type: 'zoneUp' }, st).sound, 'zoneUp');
  assert.equal(alertPlan({ type: 'zoneDown' }, st).sound, 'zoneDown');
  assert.deepEqual(alertPlan({ type: 'zoneHigh' }, st), { sound: 'warn', vibrate: [200], flash: '#f44336' });
  assert.deepEqual(alertPlan({ type: 'belowTarget' }, st), { sound: 'soft', vibrate: null, flash: null });
  assert.deepEqual(alertPlan({ type: 'disconnect' }, st), { sound: 'alarm', vibrate: [500], flash: null });
});

test('muted removes only sound', () => {
  const p = alertPlan({ type: 'stepStart', kind: 'work' }, withDefaults({ muted: true }));
  assert.deepEqual(p, { sound: null, vibrate: [400], flash: '#ff9800' });
});

test('per-event toggle', () => {
  const st = withDefaults({ alerts: { zoneChange: { sound: false } } });
  assert.equal(alertPlan({ type: 'zoneUp' }, st).sound, null);
  assert.equal(alertPlan({ type: 'countdown', n: 1 }, st).sound, 'tick');
  const st2 = withDefaults({ alerts: { stepChange: { vibrate: false, flash: false } } });
  assert.deepEqual(alertPlan({ type: 'stepStart', kind: 'work' }, st2), { sound: 'workStart', vibrate: null, flash: null });
});

const times = (mon, seq) => {
  const out = [];
  for (const [t, zone, tz] of seq) for (const e of mon.update({ zone, targetZone: tz, nowMs: t * 1000 })) out.push([t, e.type]);
  return out;
};

test('zoneHigh repeats every repeatSec', () => {
  const m = new TargetMonitor({ repeatSec: 10 });
  const seq = Array.from({ length: 26 }, (_, t) => [t, 5, null]);
  assert.deepEqual(times(m, seq), [[0, 'zoneHigh'], [10, 'zoneHigh'], [20, 'zoneHigh']]);
});

test('above target max counts as high and leaving re-arms', () => {
  const m = new TargetMonitor({ repeatSec: 10 });
  const tz = { min: 2, max: 3 };
  assert.deepEqual(times(m, [[0, 4, tz], [1, 3, tz], [2, 4, tz]]), [[0, 'zoneHigh'], [2, 'zoneHigh']]);
});

test('belowTarget fires once after 10s and re-arms after recovering', () => {
  const m = new TargetMonitor({ repeatSec: 10 });
  const tz = { min: 4, max: 5 };
  const seq = [];
  for (let t = 0; t <= 25; t++) seq.push([t, 2, tz]);
  seq.push([26, 4, tz]);
  for (let t = 27; t <= 37; t++) seq.push([t, 2, tz]);
  assert.deepEqual(times(m, seq), [[10, 'belowTarget'], [37, 'belowTarget']]);
});

test('null target only warns on zone 5', () => {
  const m = new TargetMonitor({ repeatSec: 10 });
  assert.deepEqual(times(m, [[0, 1, null], [20, 1, null], [21, 4, null]]), []);
});

test('reset clears timers', () => {
  const m = new TargetMonitor({ repeatSec: 10 });
  const tz = { min: 4, max: 5 };
  times(m, [[0, 2, tz], [9, 2, tz]]);
  m.reset();
  assert.deepEqual(times(m, [[10, 2, tz], [15, 2, tz]]), []);
});
