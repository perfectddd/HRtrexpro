import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAuthKey, authRequest, authResponse, parseAuthReply, aesEcbBlock,
  HR_START_SEQUENCE, HR_PING, AUTH_CHAR, FEE0, FEE1,
} from '../js/huami-auth.js';

const bytes = s => new Uint8Array(s.match(/../g).map(x => parseInt(x, 16)));
const arr = u => [...u];

test('parseAuthKey accepts 32 hex chars with separators or 0x', () => {
  assert.deepEqual(arr(parseAuthKey('00112233445566778899aabbccddeeff')), arr(bytes('00112233445566778899aabbccddeeff')));
  assert.deepEqual(arr(parseAuthKey(' 0x0011 2233-4455:6677 8899AABBCCDDEEFF ')), arr(bytes('00112233445566778899aabbccddeeff')));
});

test('parseAuthKey rejects wrong length or non-hex', () => {
  assert.equal(parseAuthKey(''), null);
  assert.equal(parseAuthKey('0011'), null);
  assert.equal(parseAuthKey('zz112233445566778899aabbccddeeff'), null);
  assert.equal(parseAuthKey(null), null);
});

test('authRequest with and without crypt flag', () => {
  assert.deepEqual(arr(authRequest(true)), [0x82, 0x00, 0x02, 0x01, 0x00]);
  assert.deepEqual(arr(authRequest(false)), [0x02, 0x00]);
});

test('authResponse prefixes the encrypted number', () => {
  const enc = new Uint8Array(16).fill(0xab);
  assert.deepEqual(arr(authResponse(true, enc)), [0x83, 0x00, ...arr(enc)]);
  assert.deepEqual(arr(authResponse(false, enc)).slice(0, 2), [0x03, 0x00]);
});

test('parseAuthReply: random number (from the real watch log)', () => {
  const r = parseAuthReply(bytes('108201dea34fe8d86539da320783acec892d5e'));
  assert.equal(r.type, 'random');
  assert.deepEqual(arr(r.random), arr(bytes('dea34fe8d86539da320783acec892d5e')));
});

test('parseAuthReply: success and failure', () => {
  assert.deepEqual(parseAuthReply(bytes('108301')), { type: 'success' });
  assert.deepEqual(parseAuthReply(bytes('100301')), { type: 'success' });
  assert.deepEqual(parseAuthReply(bytes('108304')), { type: 'failure', cmd: 3, status: 4 });
  assert.deepEqual(parseAuthReply(bytes('108204')), { type: 'failure', cmd: 2, status: 4 });
});

test('parseAuthReply ignores unrelated packets', () => {
  assert.equal(parseAuthReply(bytes('0102')), null);
  assert.equal(parseAuthReply(new Uint8Array([])), null);
  assert.equal(parseAuthReply(bytes('108201dead')), null); // random too short
});

test('aesEcbBlock matches FIPS-197 vector', async () => {
  const out = await aesEcbBlock(bytes('000102030405060708090a0b0c0d0e0f'), bytes('00112233445566778899aabbccddeeff'));
  assert.deepEqual(arr(out), arr(bytes('69c4e0d86a7b0430d8cdb78070b4c55a')));
});

test('protocol constants', () => {
  assert.deepEqual(HR_START_SEQUENCE.map(arr), [[0x15, 0x02, 0x00], [0x15, 0x01, 0x00], [0x15, 0x01, 0x01]]);
  assert.deepEqual(arr(HR_PING), [0x16]);
  assert.equal(AUTH_CHAR, '00000009-0000-3512-2118-0009af100700');
  assert.equal(FEE0, '0000fee0-0000-1000-8000-00805f9b34fb');
  assert.equal(FEE1, '0000fee1-0000-1000-8000-00805f9b34fb');
});
