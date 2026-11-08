export const KIND_COLORS = {
  warmup: '#ffc107',
  work: '#ff9800',
  rest: '#2196f3',
  cooldown: '#00bcd4',
  other: '#9e9e9e',
};

export const KIND_LABELS = {
  warmup: 'วอร์มอัพ',
  work: 'ทำงาน',
  rest: 'พัก',
  cooldown: 'คูลดาวน์',
  other: 'อื่นๆ',
};

export function makeStep(kind, durationSec, extra = {}) {
  return {
    type: 'step',
    name: KIND_LABELS[kind],
    kind,
    durationSec,
    targetZone: null,
    color: KIND_COLORS[kind],
    ...extra,
  };
}

function toFlat(s, round, rounds) {
  return {
    name: s.name,
    kind: s.kind,
    durationSec: s.durationSec ?? null,
    targetZone: s.targetZone ?? null,
    color: s.color || KIND_COLORS[s.kind] || KIND_COLORS.other,
    round,
    rounds,
  };
}

export function flattenWorkout(workout) {
  const out = [];
  for (const item of workout.items) {
    if (item.type === 'repeat') {
      for (let r = 1; r <= item.times; r++) {
        for (const s of item.items) out.push(toFlat(s, r, item.times));
      }
    } else {
      out.push(toFlat(item, null, null));
    }
  }
  return out;
}

function validateStep(s, where, errors) {
  if (s.type !== 'step') {
    errors.push(`${where}: บล็อกทำซ้ำซ้อนกันไม่ได้`);
    return;
  }
  if (!s.name || !String(s.name).trim()) errors.push(`${where}: ต้องมีชื่อ`);
  if (s.durationSec !== null && !(Number.isFinite(s.durationSec) && s.durationSec > 0)) {
    errors.push(`${where}: ระยะเวลาต้องมากกว่า 0`);
  }
  const tz = s.targetZone;
  if (tz && !(tz.min >= 1 && tz.max <= 5 && tz.min <= tz.max)) {
    errors.push(`${where}: Zone เป้าหมายไม่ถูกต้อง`);
  }
}

export function validateWorkout(workout) {
  const errors = [];
  if (!workout.name || !workout.name.trim()) errors.push('ต้องตั้งชื่อโปรแกรม');
  if (!workout.items || workout.items.length === 0) errors.push('ต้องมีอย่างน้อย 1 ขั้นตอน');
  (workout.items || []).forEach((item, i) => {
    const where = `ขั้นตอนที่ ${i + 1}`;
    if (item.type === 'repeat') {
      if (!(Number.isInteger(item.times) && item.times >= 1)) errors.push(`${where}: จำนวนรอบต้องอย่างน้อย 1`);
      if (!item.items || item.items.length === 0) errors.push(`${where}: บล็อกทำซ้ำต้องมีขั้นตอนข้างใน`);
      (item.items || []).forEach((s, j) => validateStep(s, `${where}.${j + 1}`, errors));
    } else {
      validateStep(item, where, errors);
    }
  });
  return errors;
}

export function totalDurationSec(workout) {
  let sec = 0;
  let hasOpen = false;
  for (const s of flattenWorkout(workout)) {
    if (s.durationSec == null) hasOpen = true;
    else sec += s.durationSec;
  }
  return { sec, hasOpen };
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `w-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createFromTemplate(key, nowMs) {
  const base = { id: newId(), createdAt: nowMs, updatedAt: nowMs };
  const block = (work, rest) => ({
    type: 'repeat',
    times: 8,
    items: [makeStep('work', work, { targetZone: { min: 4, max: 5 } }), makeStep('rest', rest)],
  });
  switch (key) {
    case 'free':
      return { ...base, name: 'อิสระ', items: [makeStep('other', null, { name: 'ฝึกอิสระ' })] };
    case 'interval':
      return { ...base, name: 'Interval', items: [makeStep('warmup', 300), block(60, 60), makeStep('cooldown', 300)] };
    case 'tabata':
      return { ...base, name: 'Tabata', items: [makeStep('warmup', 300), block(20, 10), makeStep('cooldown', 300)] };
    default:
      throw new Error(`unknown template ${key}`);
  }
}
