export function summarize(samples) {
  const zoneSec = [0, 0, 0, 0, 0];
  let sum = 0, n = 0, max = null, min = null;
  for (const s of samples) {
    if (s.bpm == null) continue;
    sum += s.bpm;
    n++;
    max = max === null ? s.bpm : Math.max(max, s.bpm);
    min = min === null ? s.bpm : Math.min(min, s.bpm);
    if (s.zone >= 1 && s.zone <= 5) zoneSec[s.zone - 1]++;
  }
  return { durationSec: samples.length, avg: n ? Math.round(sum / n) : null, max, min, zoneSec };
}

export function toCsv(session) {
  const rows = ['t,bpm,zone,stepIndex'];
  for (const s of session.samples) rows.push(`${s.t},${s.bpm ?? ''},${s.zone},${s.stepIndex}`);
  return rows.join('\n');
}
