import { ZONE_COLORS, hrMaxFor } from '../zones.js';
import { KIND_COLORS } from '../workout-model.js';
import { fmtTime } from './dom.js';

function setup(canvas, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.height = `${cssHeight}px`;
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, cssHeight);
  return { c, w, hgt: cssHeight };
}

// HR line over time with faint zone bands and a step-colour strip underneath.
export function drawHrChart(canvas, session, settings) {
  const { c, w, hgt } = setup(canvas, 220);
  const pad = { l: 36, r: 8, t: 10, b: 30 };
  const stripH = 8;
  const plotH = hgt - pad.t - pad.b;
  const samples = session.samples;
  const values = samples.map(s => s.bpm).filter(v => v != null);
  const tMax = Math.max(1, samples.length, ...session.steps.map(s => s.endT ?? 0));
  let lo = values.length ? Math.min(...values) - 10 : 60;
  let hi = values.length ? Math.max(...values) + 10 : 200;
  lo = Math.floor(lo / 10) * 10;
  hi = Math.ceil(hi / 10) * 10;
  const x = t => pad.l + (t / tMax) * (w - pad.l - pad.r);
  const y = v => pad.t + plotH - ((v - lo) / (hi - lo)) * plotH;

  // Zone bands
  const hrMax = hrMaxFor(settings);
  const bounds = settings.zoneBounds.map(p => (p / 100) * hrMax);
  for (let z = 1; z <= 5; z++) {
    const top = Math.min(hi, bounds[z]);
    const bottom = Math.max(lo, bounds[z - 1]);
    if (top <= bottom) continue;
    c.fillStyle = ZONE_COLORS[z] + '33';
    c.fillRect(pad.l, y(top), w - pad.l - pad.r, y(bottom) - y(top));
  }

  // Y grid + labels
  c.fillStyle = '#aaa';
  c.strokeStyle = '#ffffff22';
  c.font = '11px system-ui';
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  const stepY = (hi - lo) > 80 ? 20 : 10;
  for (let v = lo; v <= hi; v += stepY) {
    c.beginPath();
    c.moveTo(pad.l, y(v));
    c.lineTo(w - pad.r, y(v));
    c.stroke();
    c.fillText(String(v), pad.l - 4, y(v));
  }

  // X labels
  c.textAlign = 'center';
  c.textBaseline = 'top';
  const ticks = Math.min(5, Math.max(1, Math.floor((w - pad.l) / 80)));
  for (let i = 0; i <= ticks; i++) {
    const t = (tMax * i) / ticks;
    c.textAlign = i === ticks ? 'right' : i === 0 ? 'left' : 'center';
    c.fillText(fmtTime(t), x(t), hgt - pad.b + stripH + 6);
  }

  // Step strip
  for (const s of session.steps) {
    c.fillStyle = KIND_COLORS[s.kind] || '#888';
    const x0 = x(s.startT), x1 = x(s.endT ?? tMax);
    c.fillRect(x0, hgt - pad.b + 2, Math.max(1, x1 - x0 - 1), stripH);
  }

  // HR line (breaks across null samples)
  c.strokeStyle = '#ffffff';
  c.lineWidth = 2;
  c.lineJoin = 'round';
  c.beginPath();
  let pen = false;
  for (const s of samples) {
    if (s.bpm == null) { pen = false; continue; }
    if (pen) c.lineTo(x(s.t), y(s.bpm));
    else c.moveTo(x(s.t), y(s.bpm));
    pen = true;
  }
  c.stroke();

  if (!values.length) {
    c.fillStyle = '#aaa';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '14px system-ui';
    c.fillText('ไม่มีข้อมูลชีพจร', w / 2, pad.t + plotH / 2);
  }
}

// Horizontal bars: time spent in each zone.
export function drawZoneBars(canvas, zoneSec) {
  const rowH = 30;
  const { c, w } = setup(canvas, rowH * 5 + 8);
  const max = Math.max(1, ...zoneSec);
  const labelW = 34, valueW = 56;
  c.font = '13px system-ui';
  c.textBaseline = 'middle';
  for (let i = 0; i < 5; i++) {
    const z = 5 - i; // Z5 on top
    const yMid = 4 + i * rowH + rowH / 2;
    c.fillStyle = '#ddd';
    c.textAlign = 'left';
    c.fillText(`Z${z}`, 8, yMid);
    const barW = ((w - labelW - valueW - 16) * zoneSec[z - 1]) / max;
    c.fillStyle = ZONE_COLORS[z];
    c.fillRect(labelW, yMid - 9, Math.max(barW, zoneSec[z - 1] ? 2 : 0), 18);
    c.fillStyle = '#ddd';
    c.textAlign = 'right';
    c.fillText(fmtTime(zoneSec[z - 1]), w - 8, yMid);
  }
}
