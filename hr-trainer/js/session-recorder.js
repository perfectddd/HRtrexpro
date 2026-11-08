import { summarize } from './session-summary.js';

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Collects 1 Hz samples and step boundaries; t values are seconds since startedAt.
export class SessionRecorder {
  constructor({ workoutId, workoutName, startedAt, onCheckpoint = null, checkpointEverySec = 30, _session = null }) {
    this.onCheckpoint = onCheckpoint;
    this.checkpointEverySec = checkpointEverySec;
    this.session = _session ?? {
      id: newId(),
      workoutId: workoutId ?? null,
      workoutName,
      startedAt,
      endedAt: null,
      samples: [],
      steps: [],
      summary: null,
    };
  }

  static fromCheckpoint(session, opts = {}) {
    return new SessionRecorder({ ...opts, _session: structuredClone(session) });
  }

  addSample(sample) {
    this.session.samples.push(sample);
    if (this.onCheckpoint && this.session.samples.length % this.checkpointEverySec === 0) {
      this.onCheckpoint(this.snapshot());
    }
  }

  // Record one sample per whole active second up to activeSec. Seconds missed
  // (e.g. throttled timers in the background) are filled with bpm:null.
  recordUpTo(activeSec, { bpm, zone, stepIndex }) {
    const target = Math.floor(activeSec);
    const samples = this.session.samples;
    while (samples.length < target) {
      const last = samples.length === target - 1;
      this.addSample({
        t: samples.length,
        bpm: last ? bpm : null,
        zone: last ? zone : 0,
        stepIndex: last ? stepIndex : samples.at(-1)?.stepIndex ?? stepIndex,
      });
    }
  }

  markStep({ name, kind, startT }) {
    const prev = this.session.steps.at(-1);
    if (prev && prev.endT == null) prev.endT = startT;
    this.session.steps.push({ name, kind, startT, endT: null });
  }

  snapshot() {
    return structuredClone(this.session);
  }

  finish(endedAt, endT = (endedAt - this.session.startedAt) / 1000) {
    const s = this.session;
    s.endedAt = endedAt;
    const prev = s.steps.at(-1);
    if (prev && prev.endT == null) prev.endT = endT;
    s.summary = summarize(s.samples);
    return this.snapshot();
  }
}
