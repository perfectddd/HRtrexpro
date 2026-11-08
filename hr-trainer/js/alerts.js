const SETTING_KEY = {
  countdown: 'countdown',
  stepStart: 'stepChange',
  zoneUp: 'zoneChange',
  zoneDown: 'zoneChange',
  zoneHigh: 'zoneHigh',
  belowTarget: 'belowTarget',
  disconnect: 'disconnect',
};

function basePlan(event) {
  switch (event.type) {
    case 'countdown': return { sound: 'tick', vibrate: null, flash: null };
    case 'stepStart':
      if (event.kind === 'work') return { sound: 'workStart', vibrate: [400], flash: '#ff9800' };
      if (event.kind === 'rest') return { sound: 'restStart', vibrate: [150, 100, 150], flash: '#2196f3' };
      return { sound: 'workStart', vibrate: null, flash: null };
    case 'zoneUp': return { sound: 'zoneUp', vibrate: null, flash: null };
    case 'zoneDown': return { sound: 'zoneDown', vibrate: null, flash: null };
    case 'zoneHigh': return { sound: 'warn', vibrate: [200], flash: '#f44336' };
    case 'belowTarget': return { sound: 'soft', vibrate: null, flash: null };
    case 'disconnect': return { sound: 'alarm', vibrate: [500], flash: null };
    default: return { sound: null, vibrate: null, flash: null };
  }
}

export function alertPlan(event, settings) {
  const p = basePlan(event);
  const on = settings.alerts?.[SETTING_KEY[event.type]] ?? { sound: true, vibrate: true, flash: true };
  return {
    sound: on.sound && !settings.muted ? p.sound : null,
    vibrate: on.vibrate ? p.vibrate : null,
    flash: on.flash ? p.flash : null,
  };
}

// When timers were throttled, one tick can return several steps' worth of
// events. Only announce what is current: from the last stepStart onward, or
// just the latest countdown if no step changed.
export function alertableEvents(events) {
  let lastStart = -1;
  events.forEach((e, i) => { if (e.type === 'stepStart') lastStart = i; });
  if (lastStart >= 0) return events.slice(lastStart);
  const countdowns = events.filter(e => e.type === 'countdown');
  return countdowns.length ? [countdowns.at(-1)] : [];
}

// Watches zone vs. a step's target zone and emits zoneHigh / belowTarget.
export class TargetMonitor {
  constructor({ repeatSec, belowSec = 10 }) {
    this.repeatMs = repeatSec * 1000;
    this.belowMs = belowSec * 1000;
    this.reset();
  }

  reset() {
    this._lastHigh = null;
    this._belowSince = null;
    this._belowFired = false;
  }

  update({ zone, targetZone, nowMs }) {
    const events = [];
    const high = zone === 5 || (targetZone != null && zone > targetZone.max);
    if (high) {
      if (this._lastHigh === null || nowMs - this._lastHigh >= this.repeatMs) {
        this._lastHigh = nowMs;
        events.push({ type: 'zoneHigh' });
      }
    } else {
      this._lastHigh = null;
    }

    const below = targetZone != null && zone < targetZone.min;
    if (below) {
      if (this._belowSince === null) this._belowSince = nowMs;
      if (!this._belowFired && nowMs - this._belowSince >= this.belowMs) {
        this._belowFired = true;
        events.push({ type: 'belowTarget' });
      }
    } else {
      this._belowSince = null;
      this._belowFired = false;
    }
    return events;
  }
}

// Browser-only: plays tones, vibration and a full-screen flash.
const TONES = {
  tick: [[880, 0.06]],
  workStart: [[1320, 0.5]],
  restStart: [[440, 0.15], [0, 0.08], [440, 0.15]],
  zoneUp: [[660, 0.12], [990, 0.18]],
  zoneDown: [[990, 0.12], [660, 0.18]],
  warn: [[1000, 0.2], [0, 0.08], [1000, 0.2]],
  soft: [[520, 0.12]],
  alarm: [[300, 0.6]],
};

export class AlertPlayer {
  constructor() {
    this.ctx = null;
  }

  async unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  playSound(name) {
    const seq = TONES[name];
    if (!seq || !this.ctx) return;
    let t = this.ctx.currentTime;
    for (const [freq, dur] of seq) {
      if (freq > 0) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(this.ctx.destination);
        o.start(t);
        o.stop(t + dur);
      }
      t += dur;
    }
  }

  play(plan, flashEl) {
    if (plan.sound) this.playSound(plan.sound);
    if (plan.vibrate && navigator.vibrate) navigator.vibrate(plan.vibrate);
    if (plan.flash && flashEl) {
      flashEl.style.background = plan.flash;
      flashEl.classList.remove('flash');
      void flashEl.offsetWidth;
      flashEl.classList.add('flash');
    }
  }
}
