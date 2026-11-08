import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, toCsv } from '../js/session-summary.js';
import { SessionRecorder } from '../js/session-recorder.js';

const s = (bpm, zone, t = 0) => ({ t, bpm, zone, stepIndex: 0 });

test('summarize basic', () => {
  assert.deepEqual(summarize([s(100, 1), s(120, 2), s(140, 3)]), {
    durationSec: 3, avg: 120, max: 140, min: 100, zoneSec: [1, 1, 1, 0, 0],
  });
});

test('summarize ignores null samples', () => {
  const r = summarize([s(100, 1), s(null, 0), s(140, 3)]);
  assert.equal(r.avg, 120);
  assert.equal(r.durationSec, 3);
  assert.deepEqual(r.zoneSec, [1, 0, 1, 0, 0]);
});

test('all-null session gives nulls, not NaN', () => {
  assert.deepEqual(summarize([s(null, 0), s(null, 0)]), {
    durationSec: 2, avg: null, max: null, min: null, zoneSec: [0, 0, 0, 0, 0],
  });
  assert.deepEqual(summarize([]), { durationSec: 0, avg: null, max: null, min: null, zoneSec: [0, 0, 0, 0, 0] });
});

test('recorder checkpoints every 30 samples', () => {
  const snaps = [];
  const r = new SessionRecorder({ workoutId: 'w', workoutName: 'W', startedAt: 1000, onCheckpoint: x => snaps.push(x) });
  for (let i = 0; i < 60; i++) r.addSample(s(100, 1, i));
  assert.equal(snaps.length, 2);
  assert.equal(snaps[1].samples.length, 60);
  assert.equal(snaps[0].workoutName, 'W');
});

test('markStep closes the previous step', () => {
  const r = new SessionRecorder({ workoutId: null, workoutName: 'อิสระ', startedAt: 0 });
  r.markStep({ name: 'a', kind: 'work', startT: 0 });
  r.markStep({ name: 'b', kind: 'rest', startT: 20 });
  const sess = r.finish(30000);
  assert.equal(sess.steps[0].endT, 20);
  assert.equal(sess.steps[1].endT, 30);
  assert.equal(sess.endedAt, 30000);
  assert.ok(sess.id);
  assert.equal(sess.summary.durationSec, 0);
});

test('finish accepts an explicit endT on the active timeline', () => {
  const r = new SessionRecorder({ workoutId: null, workoutName: 'W', startedAt: 0 });
  r.markStep({ name: 'a', kind: 'work', startT: 0 });
  const sess = r.finish(60000, 45);
  assert.equal(sess.steps[0].endT, 45);
  assert.equal(sess.endedAt, 60000);
});

test('fromCheckpoint continues the same session', () => {
  const r = new SessionRecorder({ workoutId: 'w', workoutName: 'W', startedAt: 0 });
  r.addSample(s(90, 1, 0));
  const r2 = SessionRecorder.fromCheckpoint(r.snapshot());
  r2.addSample(s(110, 2, 1));
  const out = r2.finish(2000);
  assert.equal(out.id, r.snapshot().id);
  assert.equal(out.summary.avg, 100);
});

test('toCsv writes header and blanks for null', () => {
  const csv = toCsv({ samples: [{ t: 0, bpm: null, zone: 0, stepIndex: 0 }, { t: 1, bpm: 99, zone: 1, stepIndex: 0 }] });
  assert.deepEqual(csv.split('\n'), ['t,bpm,zone,stepIndex', '0,,0,0', '1,99,1,0']);
});
