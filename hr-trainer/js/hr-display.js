// How heart rate is shown between readings. The T-Rex Pro sends a value every
// ~2–3 s (sometimes 5 s), so a reading stays valid for a while instead of
// flashing "--" between packets.

export const FRESH_MS = 8000;   // shown normally and recorded
export const LOST_MS = 20000;   // after this (or a real disconnect) show "--"

// 'fresh' | 'holding' (last value, dimmed) | 'lost'
export function hrStatus(lastHr, nowMs, connState) {
  if (!lastHr || connState === 'disconnected') return 'lost';
  const age = nowMs - lastHr.t;
  if (age <= FRESH_MS) return 'fresh';
  if (age <= LOST_MS) return 'holding';
  return 'lost';
}

// Value written to the session (1 Hz): the last reading while fresh, else null.
export function recordedBpm(lastHr, nowMs) {
  return lastHr && nowMs - lastHr.t <= FRESH_MS ? lastHr.bpm : null;
}

const easeOut = x => 1 - (1 - x) ** 3;

// Smoothly moves the displayed number to each new reading.
export class BpmTween {
  constructor(durationMs = 600) {
    this.duration = durationMs;
    this.from = null;
    this.to = null;
    this.start = 0;
  }

  set(target, nowMs) {
    if (target === this.to) return;
    const current = this.value(nowMs);
    if (target == null || current == null) {
      this.from = target;
    } else {
      this.from = current;
    }
    this.to = target;
    this.start = nowMs;
  }

  value(nowMs) {
    if (this.to == null) return null;
    if (this.from == null) return this.to;
    const p = Math.min(1, Math.max(0, (nowMs - this.start) / this.duration));
    return this.from + (this.to - this.from) * easeOut(p);
  }
}
