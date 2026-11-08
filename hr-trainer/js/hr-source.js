import { parseHeartRate, isValidBpm } from './hr-parse.js';

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

export class BleHeartRateSource extends BaseSource {
  constructor() {
    super();
    this.device = null;
    this._char = null;
    this._wantConnected = false;
    this._timer = null;
    this._onValue = e => {
      const { bpm, rr } = parseHeartRate(e.target.value);
      this._hr(bpm, rr);
    };
    this._onDisconnected = () => this._scheduleReconnect(0, 0);
  }

  get deviceName() {
    return this.device?.name ?? null;
  }

  async connect() {
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
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
    await this._subscribe();
  }

  async _subscribe() {
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    this._char = await service.getCharacteristic('heart_rate_measurement');
    this._char.addEventListener('characteristicvaluechanged', this._onValue);
    await this._char.startNotifications();
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
      } catch {
        const f = failures + 1;
        if (f === 3) this._status('disconnected');
        this._scheduleReconnect(attempt + 1, f);
      }
    }, nextBackoff(attempt));
  }

  disconnect() {
    this._wantConnected = false;
    clearTimeout(this._timer);
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
