import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenWorkout, validateWorkout, totalDurationSec, createFromTemplate, KIND_COLORS } from '../js/workout-model.js';

const step = (o = {}) => ({ type: 'step', name: 'x', kind: 'work', durationSec: 10, targetZone: null, color: '#fff', ...o });
const wk = items => ({ id: 'w', name: 'W', createdAt: 0, updatedAt: 0, items });

test('tabata flattens to 18 steps', () => {
  const f = flattenWorkout(createFromTemplate('tabata', 0));
  assert.equal(f.length, 18);
  assert.equal(f[0].kind, 'warmup');
  assert.deepEqual(
    { kind: f[1].kind, durationSec: f[1].durationSec, round: f[1].round, rounds: f[1].rounds },
    { kind: 'work', durationSec: 20, round: 1, rounds: 8 },
  );
  assert.equal(f[2].kind, 'rest');
  assert.equal(f[2].durationSec, 10);
  assert.equal(f[16].round, 8);
  assert.equal(f[17].kind, 'cooldown');
  assert.equal(f[17].round, null);
});

test('tabata total', () => {
  assert.deepEqual(totalDurationSec(createFromTemplate('tabata', 0)), { sec: 840, hasOpen: false });
});

test('free has one open step', () => {
  const w = createFromTemplate('free', 0);
  assert.equal(flattenWorkout(w).length, 1);
  assert.deepEqual(totalDurationSec(w), { sec: 0, hasOpen: true });
  assert.equal(w.name, 'อิสระ');
});

test('interval template', () => {
  const f = flattenWorkout(createFromTemplate('interval', 0));
  assert.equal(f.length, 18);
  assert.equal(f[0].durationSec, 300);
  assert.equal(f[1].durationSec, 60);
  assert.equal(f[2].durationSec, 60);
  assert.equal(f[17].durationSec, 300);
});

test('templates are valid and get unique ids and kind colors', () => {
  const a = createFromTemplate('tabata', 5), b = createFromTemplate('tabata', 5);
  assert.notEqual(a.id, b.id);
  assert.equal(a.createdAt, 5);
  assert.deepEqual(validateWorkout(a), []);
  assert.equal(flattenWorkout(a)[1].color, KIND_COLORS.work);
});

test('validate rejects bad workouts', () => {
  assert.ok(validateWorkout(wk([{ type: 'repeat', times: 0, items: [step()] }])).length >= 1);
  assert.ok(validateWorkout(wk([step({ durationSec: 0 })])).length >= 1);
  assert.ok(validateWorkout(wk([])).length >= 1);
  assert.ok(validateWorkout({ ...wk([step()]), name: '  ' }).length >= 1);
  assert.ok(validateWorkout(wk([{ type: 'repeat', times: 2, items: [] }])).length >= 1);
});

test('validate rejects nested repeat', () => {
  const nested = { type: 'repeat', times: 2, items: [{ type: 'repeat', times: 2, items: [step()] }] };
  assert.ok(validateWorkout(wk([nested])).length >= 1);
});

test('validate accepts open step', () => {
  assert.deepEqual(validateWorkout(wk([step({ durationSec: null })])), []);
});
