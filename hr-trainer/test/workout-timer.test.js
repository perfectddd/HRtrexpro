import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutTimer } from '../js/workout-timer.js';
import { flattenWorkout } from '../js/workout-model.js';

const S = (name, durationSec) => ({ name, kind: 'work', durationSec, targetZone: null, color: '#fff', round: null, rounds: null });
const steps = () => [S('A', 10), S('B', null), S('C', 5)];
const types = evs => evs.map(e => (e.type === 'countdown' ? `c${e.n}` : e.type === 'stepStart' ? `s${e.index}` : e.type));
const ms = s => s * 1000;

test('start emits stepStart 0', () => {
  const t = new WorkoutTimer(steps());
  const ev = t.start(0);
  assert.deepEqual(types(ev), ['s0']);
  assert.equal(ev[0].step.name, 'A');
  assert.equal(t.getState(0).status, 'running');
});

test('countdown fires 3,2,1 once each then next step', () => {
  const t = new WorkoutTimer(steps());
  t.start(0);
  assert.deepEqual(types(t.tick(ms(7))), ['c3']);
  assert.deepEqual(types(t.tick(ms(7.5))), []);
  assert.deepEqual(types(t.tick(ms(8))), ['c2']);
  assert.deepEqual(types(t.tick(ms(9))), ['c1']);
  assert.deepEqual(types(t.tick(ms(10))), ['s1']);
});

test('large gap emits all crossed events in order', () => {
  const t = new WorkoutTimer(steps());
  t.start(0);
  assert.deepEqual(types(t.tick(ms(10))), ['c3', 'c2', 'c1', 's1']);
});

test('open step never ends by time; skip advances', () => {
  const t = new WorkoutTimer(steps());
  t.start(0);
  t.tick(ms(10));
  assert.deepEqual(types(t.tick(ms(1000))), []);
  const st = t.getState(ms(1000));
  assert.equal(st.stepIndex, 1);
  assert.equal(st.stepRemainingSec, null);
  assert.ok(Math.abs(st.stepElapsedSec - 990) < 1e-9);
  assert.deepEqual(types(t.skip(ms(1000))), ['s2']);
});

test('open step inside a repeat behaves the same', () => {
  const w = { items: [{ type: 'repeat', times: 2, items: [{ type: 'step', name: 'go', kind: 'work', durationSec: null }, { type: 'step', name: 'r', kind: 'rest', durationSec: 5 }] }] };
  const t = new WorkoutTimer(flattenWorkout(w));
  t.start(0);
  assert.deepEqual(types(t.tick(ms(500))), []);
  assert.deepEqual(types(t.skip(ms(500))), ['s1']);
  assert.deepEqual(types(t.tick(ms(505))), ['c3', 'c2', 'c1', 's2']);
  assert.deepEqual(types(t.tick(ms(900))), []);
  assert.equal(t.getState(ms(900)).step.round, 2);
});

test('pause freezes time and countdown does not refire', () => {
  const t = new WorkoutTimer(steps());
  t.start(0);
  assert.deepEqual(types(t.tick(ms(7.5))), ['c3']);
  t.pause(ms(7.5));
  assert.deepEqual(types(t.tick(ms(50))), []);
  assert.equal(t.getState(ms(50)).status, 'paused');
  t.resume(ms(100));
  const st = t.getState(ms(100));
  assert.ok(Math.abs(st.stepElapsedSec - 7.5) < 1e-9);
  assert.ok(Math.abs(st.stepRemainingSec - 2.5) < 1e-9);
  assert.deepEqual(types(t.tick(ms(100.5))), ['c2']);
});

test('pause across a step boundary does not advance', () => {
  const t = new WorkoutTimer(steps());
  t.start(0);
  t.pause(ms(9.5));
  assert.deepEqual(types(t.tick(ms(30))), []);
  assert.equal(t.getState(ms(30)).stepIndex, 0);
});

test('last step ends with finished; total excludes pauses', () => {
  const t = new WorkoutTimer([S('A', 4), S('B', 4)]);
  t.start(0);
  t.pause(ms(2));
  t.resume(ms(12));
  assert.deepEqual(types(t.tick(ms(20))), ['c3', 'c2', 'c1', 's1', 'c3', 'c2', 'c1', 'finished']);
  const st = t.getState(ms(25));
  assert.equal(st.status, 'finished');
  assert.ok(Math.abs(st.totalElapsedSec - 8) < 1e-9);
  assert.deepEqual(types(t.tick(ms(30))), []);
});

test('stop emits finished', () => {
  const t = new WorkoutTimer(steps());
  t.start(0);
  assert.deepEqual(types(t.stop(ms(3))), ['finished']);
  assert.equal(t.getState(ms(3)).status, 'finished');
  assert.ok(Math.abs(t.getState(ms(9)).totalElapsedSec - 3) < 1e-9);
});

test('countdown skipped when step shorter than n', () => {
  const t = new WorkoutTimer([S('A', 2), S('B', 10)]);
  t.start(0);
  assert.deepEqual(types(t.tick(ms(2))), ['c1', 's1']);
});

test('state exposes next step', () => {
  const t = new WorkoutTimer(steps());
  t.start(0);
  assert.equal(t.getState(0).nextStep.name, 'B');
  t.tick(ms(10)); t.skip(ms(11));
  assert.equal(t.getState(ms(11)).nextStep, null);
});
