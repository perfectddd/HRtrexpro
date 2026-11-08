import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHeartRate, isValidBpm } from '../js/hr-parse.js';

const dv = bytes => new DataView(new Uint8Array(bytes).buffer);

test('parses uint8 bpm', () => {
  assert.deepEqual(parseHeartRate(dv([0x00, 72])), { bpm: 72, rr: [] });
});

test('parses uint16 bpm', () => {
  assert.equal(parseHeartRate(dv([0x01, 0x2c, 0x01])).bpm, 300);
});

test('skips energy expended before RR', () => {
  assert.deepEqual(parseHeartRate(dv([0x18, 80, 0x10, 0x00, 0x00, 0x04])), { bpm: 80, rr: [1000] });
});

test('parses multiple RR', () => {
  assert.deepEqual(parseHeartRate(dv([0x10, 60, 0x00, 0x04, 0x00, 0x02])).rr, [1000, 500]);
});

test('isValidBpm bounds', () => {
  assert.equal(isValidBpm(0), false);
  assert.equal(isValidBpm(1), true);
  assert.equal(isValidBpm(230), true);
  assert.equal(isValidBpm(231), false);
});
