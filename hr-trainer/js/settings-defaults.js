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
