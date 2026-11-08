import { parseHeartRate, isValidBpm } from './hr-parse.js';
import {
  FEE0, FEE1, AUTH_CHAR, HR_START_SEQUENCE, HR_PING, HR_PING_INTERVAL_MS,
  authRequest, authResponse, parseAuthReply, aesEcbBlock,
} from './huami-auth.js';

const BACKOFF = [1000, 2000, 4000, 8000, 10000];

export function nextBackoff(attempt) {
  return BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
}

export function isBluetoothSupported() {
  return !!globalThis.navigator?.bluetooth;
}

class BaseSource extends EventTarget {
  constructor() {
    super();
    this.state = 'disconnected';
  }

  _status(state) {
    if (this.state === state) return;
    this.state = state;
    this.dispatchEvent(new CustomEvent('status', { detail: { state } }));
  }

  _hr(bpm, rr = []) {
    if (!isValidBpm(bpm)) return;
    this.dispatchEvent(new CustomEvent('hr', { detail: { bpm, rr, t: Date.now() } }));
  }
}

async function write(characteristic, bytes) {
  if (characteristic.writeValueWithResponse) return characteristic.writeValueWithResponse(bytes);
  return characteristic.writeValue(bytes);
}

// Authenticate with the watch's existing key; resolves on success, throws otherwise.
async function authenticate(server, key, crypt, timeoutMs = 8000) {
  const ch = await (await server.getPrimaryService(FEE1)).getCharacteristic(AUTH_CHAR);
  const fail = msg => Object.assign(new Error(msg), { name: 'AuthFailed' });
  let onValue;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(fail('นาฬิกาไม่ตอบการยืนยันตัว (หมดเวลา)')), timeoutMs);
      onValue = async e => {
        const reply = parseAuthReply(new Uint8Array(e.target.value.buffer));
        if (!reply) return;
        try {
          if (reply.type === 'random') {
            await ch.writeValueWithoutResponse(authResponse(crypt, await aesEcbBlock(key, reply.random)));
          } else if (reply.type === 'success') {
            clearTimeout(timer);
            resolve();
          } else {
            clearTimeout(timer);
            reject(fail(`ยืนยันตัวไม่ผ่าน (status ${reply.status}) — ตรวจ auth key หรือสลับตัวเลือก crypt flag`));
          }
        } catch (err) {
          clearTimeout(timer);
          reject(err);
        }
      };
      ch.addEventListener('characteristicvaluechanged', onValue);
      ch.startNotifications()
        .then(() => ch.writeValueWithoutResponse(authRequest(crypt)))
        .catch(err => { clearTimeout(timer); reject(err); });
    });
  } finally {
    ch.removeEventListener('characteristicvaluechanged', onValue);
  }
}

export class BleHeartRateSource extends BaseSource {
  constructor(getAuth = () => ({ key: null, crypt: true })) {
    super();
    // getAuth() -> { key: Uint8Array|null, crypt: boolean }, read on every (re)connect.
    this.getAuth = getAuth;
    this.device = null;
    this._char = null;
    this._wantConnected = false;
    this._timer = null;
    this._ping = null;
    this._onValue = e => {
      const { bpm, rr } = parseHeartRate(e.target.value);
      this._hr(bpm, rr);
    };
    this._onDisconnected = () => {
      clearInterval(this._ping);
      this._scheduleReconnect(0, 0);
    };
  }

  get deviceName() {
    return this.device?.name ?? null;
  }

  async connect() {
    const device = await navigator.bluetooth.requestDevice({
      // Standard HR broadcasters, plus Amazfit/Zepp watches that only advertise fee0.
      filters: [{ services: ['heart_rate'] }, { namePrefix: 'Amazfit' }, { services: [FEE0] }],
      optionalServices: ['heart_rate', FEE0, FEE1],
    });
    await this._use(device);
  }

  // Reconnect to a previously permitted device without the chooser, if the browser allows.
  async reconnectKnown() {
    if (!navigator.bluetooth.getDevices) return false;
    const devices = await navigator.bluetooth.getDevices();
    if (!devices.length) return false;
    try {
      await this._use(devices[0]);
      return true;
    } catch {
      return false;
    }
  }

  async _use(device) {
    if (this.device && this.device !== device) this.device.removeEventListener('gattserverdisconnected', this._onDisconnected);
    this.device = device;
    this._wantConnected = true;
    device.addEventListener('gattserverdisconnected', this._onDisconnected);
    try {
      await this._subscribe();
    } catch (err) {
      // First connect failed: don't start the background reconnect loop.
      this.disconnect();
      throw err;
    }
  }

  async _subscribe() {
    const { key, crypt } = this.getAuth();
    const isZepp = /^amazfit/i.test(this.device.name || '');
    if (isZepp && !key) {
      throw Object.assign(new Error('นาฬิกา Amazfit ต้องใส่ auth key ในหน้าตั้งค่าก่อน'), { name: 'AuthKeyMissing' });
    }
    const server = await this.device.gatt.connect();
    if (key) await authenticate(server, key, crypt);
    if (!this._wantConnected) return;
    const service = await server.getPrimaryService('heart_rate');
    this._char = await service.getCharacteristic('heart_rate_measurement');
    this._char.addEventListener('characteristicvaluechanged', this._onValue);
    await this._char.startNotifications();
    if (key) {
      // Zepp watches only stream HR after "start continuous" and need a keep-alive ping.
      const cp = await service.getCharacteristic('heart_rate_control_point');
      for (const cmd of HR_START_SEQUENCE) await write(cp, cmd);
      clearInterval(this._ping);
      this._ping = setInterval(() => write(cp, HR_PING).catch(() => {}), HR_PING_INTERVAL_MS);
    }
    if (!this._wantConnected) return;
    this._status('connected');
  }

  _scheduleReconnect(attempt, failures) {
    if (!this._wantConnected) return;
    if (failures === 0) this._status('reconnecting');
    clearTimeout(this._timer);
    this._timer = setTimeout(async () => {
      if (!this._wantConnected) return;
      try {
        if (this._char) this._char.removeEventListener('characteristicvaluechanged', this._onValue);
        await this._subscribe();
      } catch (err) {
        if (err?.name === 'AuthFailed' || err?.name === 'AuthKeyMissing') {
          // Retrying with the same wrong key cannot succeed.
          this.disconnect();
          return;
        }
        const f = failures + 1;
        if (f === 3) this._status('disconnected');
        this._scheduleReconnect(attempt + 1, f);
      }
    }, nextBackoff(attempt));
  }

  disconnect() {
    this._wantConnected = false;
    clearTimeout(this._timer);
    clearInterval(this._ping);
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this._status('disconnected');
  }

  async forget() {
    this.disconnect();
    if (this.device?.forget) await this.device.forget();
    this.device = null;
  }
}

// Fake source for testing UI without a watch: sine 90..175 bpm, 60 s period, ±3 noise.
export class DemoSource extends BaseSource {
  constructor() {
    super();
    this._timer = null;
    this._t0 = 0;
  }

  get deviceName() {
    return 'Demo';
  }

  connect() {
    this._t0 = Date.now();
    this._status('connected');
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      const t = (Date.now() - this._t0) / 1000;
      const bpm = Math.round(132.5 + 42.5 * Math.sin((2 * Math.PI * t) / 60) + (Math.random() * 6 - 3));
      this._hr(bpm);
    }, 1000);
    return Promise.resolve();
  }

  reconnectKnown() {
    return Promise.resolve(false);
  }

  disconnect() {
    clearInterval(this._timer);
    this._status('disconnected');
  }
}
