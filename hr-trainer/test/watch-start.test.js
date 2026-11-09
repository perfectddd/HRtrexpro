import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WatchStartTrigger } from '../js/watch-start.js';
import { parseDeviceEvent, DEVICE_EVENT_CHAR } from '../js/huami-auth.js';

test('parseDeviceEvent: button press from T-Rex Pro', () => {
  assert.deepEqual(parseDeviceEvent(new Uint8Array([0x04])), { type: 'button' });
});

test('parseDeviceEvent: other events and empty packets', () => {
  assert.deepEqual(parseDeviceEvent(new Uint8Array([0x13, 0x00])), { type: 'other', code: 0x13 });
  assert.equal(parseDeviceEvent(new Uint8Array([])), null);
  assert.equal(parseDeviceEvent(null), null);
  assert.equal(DEVICE_EVENT_CHAR, '00000010-0000-3512-2118-0009af100700');
});

test('trigger ignores buttons until armed', () => {
  const t = new WatchStartTrigger();
  assert.equal(t.armed, false);
  assert.equal(t.onButton(), false);
});

test('trigger fires once after arming, then disarms', () => {
  const t = new WatchStartTrigger();
  t.arm();
  assert.equal(t.armed, true);
  assert.equal(t.onButton(), true);
  assert.equal(t.armed, false);
  assert.equal(t.onButton(), false);
});

test('disarm cancels a pending start', () => {
  const t = new WatchStartTrigger();
  t.arm();
  t.disarm();
  assert.equal(t.onButton(), false);
});
