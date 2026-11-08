export const ZONE_COLORS = ['#424242', '#9e9e9e', '#2196f3', '#4caf50', '#ff9800', '#f44336'];
export const ZONE_NAMES = ['—', 'Z1 วอร์มอัพ', 'Z2 เผาผลาญไขมัน', 'Z3 แอโรบิก', 'Z4 แอนแอโรบิก', 'Z5 สูงสุด'];

export function hrMaxFor(settings) {
  return settings.hrMaxManual ? settings.hrMax : 220 - settings.age;
}

export function pctOfMax(bpm, hrMax) {
  return Math.round((bpm / hrMax) * 100);
}

export function zoneFor(bpm, hrMax, zoneBounds) {
  const pct = (bpm / hrMax) * 100;
  if (pct < zoneBounds[0]) return 0;
  for (let i = 1; i <= 5; i++) if (pct < zoneBounds[i]) return i;
  return 5;
}

// Emits a zone change only after the new zone has held for holdMs.
export class ZoneDetector {
  constructor({ holdMs = 3000 } = {}) {
    this.holdMs = holdMs;
    this._current = null;
    this._pending = null;
    this._pendingSince = 0;
  }

  get current() {
    return this._current;
  }

  update(zone, nowMs) {
    if (this._current === null) {
      this._current = zone;
      return null;
    }
    if (zone === this._current) {
      this._pending = null;
      return null;
    }
    if (zone !== this._pending) {
      this._pending = zone;
      this._pendingSince = nowMs;
      return null;
    }
    if (nowMs - this._pendingSince >= this.holdMs) {
      const ev = { from: this._current, to: zone };
      this._current = zone;
      this._pending = null;
      return ev;
    }
    return null;
  }
}
