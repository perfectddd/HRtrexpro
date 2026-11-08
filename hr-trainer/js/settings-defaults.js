const on = () => ({ sound: true, vibrate: true, flash: true });

export const ALERT_KEYS = ['countdown', 'stepChange', 'zoneChange', 'zoneHigh', 'belowTarget', 'disconnect'];

export const DEFAULT_SETTINGS = Object.freeze({
  age: 30,
  hrMax: 190,
  hrMaxManual: false,
  zoneBounds: [50, 60, 70, 80, 90, 100],
  muted: false,
  zoneHighRepeatSec: 10,
  alerts: Object.fromEntries(ALERT_KEYS.map(k => [k, on()])),
});

export function boundsError(bounds) {
  if (bounds.some(b => !Number.isFinite(b) || b <= 0)) return 'ขอบ Zone ต้องเป็นตัวเลขมากกว่า 0';
  for (let i = 1; i < bounds.length; i++) if (bounds[i] <= bounds[i - 1]) return 'ขอบ Zone ต้องเรียงจากน้อยไปมาก';
  return null;
}

// Deep-merge stored settings over defaults so new keys always exist.
export function withDefaults(stored = {}) {
  const alerts = {};
  for (const k of ALERT_KEYS) alerts[k] = { ...DEFAULT_SETTINGS.alerts[k], ...(stored.alerts?.[k] || {}) };
  return {
    ...structuredClone({ ...DEFAULT_SETTINGS, alerts: undefined }),
    ...stored,
    zoneBounds: stored.zoneBounds ? [...stored.zoneBounds] : [...DEFAULT_SETTINGS.zoneBounds],
    alerts,
  };
}
