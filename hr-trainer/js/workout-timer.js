// Pure workout state machine. All times are passed in (ms) so it is testable.
// Internally tracks "active" time: wall time minus paused time.
export class WorkoutTimer {
  constructor(steps) {
    this.steps = steps;
    this.status = 'idle';
    this.index = 0;
    this._startedAt = 0;
    this._pausedTotal = 0;
    this._pausedAt = 0;
    this._stepStartActive = 0;
    this._finishedActive = null;
    this._fired = new Set();
  }

  _active(nowMs) {
    if (this._finishedActive !== null) return this._finishedActive;
    if (this.status === 'idle') return 0;
    const pausedNow = this.status === 'paused' ? nowMs - this._pausedAt : 0;
    return nowMs - this._startedAt - this._pausedTotal - pausedNow;
  }

  _enter(index, activeMs) {
    this.index = index;
    this._stepStartActive = activeMs;
    this._fired = new Set();
    return { type: 'stepStart', index, step: this.steps[index] };
  }

  _finish(activeMs) {
    this.status = 'finished';
    this._finishedActive = activeMs;
    return { type: 'finished' };
  }

  start(nowMs) {
    if (this.status !== 'idle') return [];
    this.status = 'running';
    this._startedAt = nowMs;
    if (this.steps.length === 0) return [this._finish(0)];
    return [this._enter(0, 0)];
  }

  pause(nowMs) {
    if (this.status !== 'running') return;
    this.status = 'paused';
    this._pausedAt = nowMs;
  }

  resume(nowMs) {
    if (this.status !== 'paused') return;
    this._pausedTotal += nowMs - this._pausedAt;
    this.status = 'running';
  }

  skip(nowMs) {
    if (this.status !== 'running' && this.status !== 'paused') return [];
    const active = this._active(nowMs);
    if (this.index + 1 >= this.steps.length) return [this._finish(active)];
    return [this._enter(this.index + 1, active)];
  }

  stop(nowMs) {
    if (this.status === 'idle' || this.status === 'finished') return [];
    return [this._finish(this._active(nowMs))];
  }

  tick(nowMs) {
    if (this.status !== 'running') return [];
    const active = this._active(nowMs);
    const events = [];
    for (;;) {
      const dur = this.steps[this.index].durationSec;
      if (dur == null) break;
      const durMs = dur * 1000;
      const elapsed = active - this._stepStartActive;
      for (let n = 3; n >= 1; n--) {
        if (n < dur && !this._fired.has(n) && elapsed >= durMs - n * 1000) {
          this._fired.add(n);
          events.push({ type: 'countdown', n });
        }
      }
      if (elapsed < durMs) break;
      const endActive = this._stepStartActive + durMs;
      if (this.index + 1 >= this.steps.length) {
        events.push(this._finish(endActive));
        break;
      }
      events.push(this._enter(this.index + 1, endActive));
    }
    return events;
  }

  getState(nowMs) {
    const active = this._active(nowMs);
    const step = this.steps[this.index] ?? null;
    const stepElapsedSec = this.status === 'idle' ? 0 : (active - this._stepStartActive) / 1000;
    const dur = step?.durationSec ?? null;
    return {
      status: this.status,
      stepIndex: this.index,
      step,
      nextStep: this.steps[this.index + 1] ?? null,
      stepElapsedSec,
      stepRemainingSec: dur == null ? null : Math.max(0, dur - stepElapsedSec),
      totalElapsedSec: active / 1000,
    };
  }
}
