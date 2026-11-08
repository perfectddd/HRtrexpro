import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextBackoff, isBluetoothSupported } from '../js/hr-source.js';

test('nextBackoff steps and caps at 10s', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(nextBackoff), [1000, 2000, 4000, 8000, 10000, 10000]);
});

test('isBluetoothSupported is false without navigator.bluetooth', () => {
  assert.equal(isBluetoothSupported(), false);
});
