// Huami/Zepp BLE authentication using the watch's EXISTING auth key.
// Never sends the "set new key" command (0x01), so pairing with Zepp is untouched.
// Verified on Amazfit T-Rex Pro (see spike/RESULT.md).

export const FEE0 = '0000fee0-0000-1000-8000-00805f9b34fb';
export const FEE1 = '0000fee1-0000-1000-8000-00805f9b34fb';
export const AUTH_CHAR = '00000009-0000-3512-2118-0009af100700';

// Heart Rate Control Point (0x2A39): stop manual, stop continuous, start continuous.
export const HR_START_SEQUENCE = [
  new Uint8Array([0x15, 0x02, 0x00]),
  new Uint8Array([0x15, 0x01, 0x00]),
  new Uint8Array([0x15, 0x01, 0x01]),
];
export const HR_PING = new Uint8Array([0x16]);
export const HR_PING_INTERVAL_MS = 12000;

const CRYPT = 0x80;
const AUTH_FLAGS = 0x00;

export function parseAuthKey(input) {
  if (typeof input !== 'string') return null;
  const clean = input.trim().replace(/^0x/i, '').replace(/[\s:-]/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(clean)) return null;
  return new Uint8Array(clean.match(/../g).map(x => parseInt(x, 16)));
}

export function authRequest(crypt) {
  return crypt
    ? new Uint8Array([0x02 | CRYPT, AUTH_FLAGS, 0x02, 0x01, 0x00])
    : new Uint8Array([0x02, AUTH_FLAGS]);
}

export function authResponse(crypt, encrypted16) {
  return new Uint8Array([0x03 | (crypt ? CRYPT : 0), AUTH_FLAGS, ...encrypted16]);
}

// Reply format: 0x10, <cmd | crypt>, <status>, [payload]. status 0x01 = ok.
export function parseAuthReply(bytes) {
  if (!bytes || bytes.length < 3 || bytes[0] !== 0x10) return null;
  const cmd = bytes[1] & 0x0f;
  const status = bytes[2];
  if (status !== 0x01) return { type: 'failure', cmd, status };
  if (cmd === 0x02) {
    if (bytes.length < 19) return null;
    return { type: 'random', random: bytes.slice(3, 19) };
  }
  if (cmd === 0x03) return { type: 'success' };
  return null;
}

// AES-128-ECB of one block: CBC with a zero IV gives E(P) as the first block.
export async function aesEcbBlock(keyBytes, block) {
  const key = await globalThis.crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  const out = await globalThis.crypto.subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, key, block);
  return new Uint8Array(out).slice(0, 16);
}
