import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hrStatus, recordedBpm, BpmTween, FRESH_MS, LOST_MS } from '../js/hr-display.js';

const hr = (bpm, t) => ({ bpm, t });

test('thresholds', () => {
  assert.equal(FRESH_MS, 8000);
  assert.equal(LOST_MS, 20000);
});

test('hrStatus: fresh, holding, lost by age', () => {
  assert.equal(hrStatus(hr(150, 0), 0, 'connected'), 'fresh');
  assert.equal(hrStatus(hr(150, 0), 5000, 'connected'), 'fresh'); // a normal 5 s gap from the watch
  assert.equal(hrStatus(hr(150, 0), 8000, 'connected'), 'fresh');
  assert.equal(hrStatus(hr(150, 0), 8001, 'connected'), 'holding');
  assert.equal(hrStatus(hr(150, 0), 20000, 'reconnecting'), 'holding');
  assert.equal(hrStatus(hr(150, 0), 20001, 'connected'), 'lost');
});

test('hrStatus: no reading or a real disconnect is lost', () => {
  assert.equal(hrStatus(null, 0, 'connected'), 'lost');
  assert.equal(hrStatus(hr(150, 0), 1000, 'disconnected'), 'lost');
});

test('recordedBpm keeps the last value up to 8 s, then null', () => {
  assert.equal(recordedBpm(hr(150, 0), 2900), 150);
  assert.equal(recordedBpm(hr(150, 0), 8000), 150);
  assert.equal(recordedBpm(hr(150, 0), 8001), null);
  assert.equal(recordedBpm(null, 0), null);
});

test('BpmTween jumps on the first value', () => {
  const t = new BpmTween(600);
  assert.equal(t.value(0), null);
  t.set(150, 0);
  assert.equal(t.value(0), 150);
});

test('BpmTween eases to a new value within the duration', () => {
  const t = new BpmTween(600);
  t.set(150, 0);
  t.set(160, 1000);
  assert.equal(t.value(1000), 150);
  const mid = t.value(1300);
  assert.ok(mid > 150 && mid < 160, `mid ${mid}`);
  assert.equal(t.value(1600), 160);
  assert.equal(t.value(5000), 160);
});

test('BpmTween retargets from the current displayed value', () => {
  const t = new BpmTween(600);
  t.set(100, 0);
  t.set(160, 0);
  const at300 = t.value(300);
  t.set(120, 300);
  assert.equal(t.value(300), at300); // no jump when the target changes mid-way
  assert.equal(t.value(900), 120);
});

test('BpmTween null clears the display', () => {
  const t = new BpmTween(600);
  t.set(150, 0);
  t.set(null, 100);
  assert.equal(t.value(100), null);
  t.set(140, 200);
  assert.equal(t.value(200), 140); // jumps again after a gap
});
