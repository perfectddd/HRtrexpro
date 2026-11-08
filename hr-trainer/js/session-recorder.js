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

  markStep({ name, kind, startT }) {
    const prev = this.session.steps.at(-1);
    if (prev && prev.endT == null) prev.endT = startT;
    this.session.steps.push({ name, kind, startT, endT: null });
  }

  snapshot() {
    return structuredClone(this.session);
  }

  finish(endedAt) {
    const s = this.session;
    s.endedAt = endedAt;
    const endT = (endedAt - s.startedAt) / 1000;
    const prev = s.steps.at(-1);
    if (prev && prev.endT == null) prev.endT = endT;
    s.summary = summarize(s.samples);
    return this.snapshot();
  }
}
