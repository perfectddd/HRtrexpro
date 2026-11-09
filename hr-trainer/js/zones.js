// Index 0 = no data, 1..5 = Z1..Z5. Default is the "soft" preset.
export const ZONE_PRESETS = {
  soft: { label: 'นุ่มนวล', colors: ['#2a313c', '#94a3b8', '#38bdf8', '#34d399', '#fbbf24', '#fb7185'] },
  classic: { label: 'คลาสสิก', colors: ['#424242', '#9e9e9e', '#2196f3', '#4caf50', '#ff9800', '#f44336'] },
  earth: { label: 'เอิร์ธโทน', colors: ['#2f2b27', '#a7b4a0', '#7fa7b8', '#c9b27c', '#d08c60', '#b85c5c'] },
};
export const ZONE_COLORS = ZONE_PRESETS.soft.colors;
export const ZONE_NAMES = ['—', 'Z1 วอร์มอัพ', 'Z2 เผาผลาญไขมัน', 'Z3 แอโรบิก', 'Z4 แอนแอโรบิก', 'Z5 สูงสุด'];

const HEX6 = /^#[0-9a-f]{6}$/i;
export const isHexColor = c => typeof c === 'string' && HEX6.test(c);

// The user's colour for a zone (0 = no data), falling back to the built-in palette.
export function zoneColorFor(zone, settings) {
  const custom = settings?.zoneColors?.[zone];
  if (isHexColor(custom)) return custom;
  return ZONE_COLORS[zone] ?? ZONE_COLORS[0];
}

// Readable text colour (near-black or white) for a given background.
export function textColorFor(hex) {
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const n = parseInt(hex.slice(1), 16);
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // White on saturated/mid colours (zone reds, oranges, greens), dark only on light ones.
  return L > 0.4 ? '#111111' : '#ffffff';
}

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
