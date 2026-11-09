import { h, fmtTime, fmtDate, confirmDelete, download, icon } from './dom.js';
import { drawHrChart, drawZoneBars } from './charts.js';
import { toCsv } from '../session-summary.js';

const dash = v => (v == null ? '—' : String(v));

export async function mount(root, ctx) {
  const { storage } = ctx;
  const session = await storage.getSession(ctx.params[0]);
  if (!session) {
    root.replaceChildren(h('p', {}, 'ไม่พบการฝึกนี้'), h('button', { onclick: () => ctx.navigate('#/history') }, 'กลับ'));
    return;
  }
  const s = session.summary;
  const hrCanvas = h('canvas', { class: 'chart' });
  const zoneCanvas = h('canvas', { class: 'chart' });
  const stamp = new Date(session.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const base = `hr-${stamp}`;

  async function remove() {
    if (await confirmDelete('การฝึกนี้')) {
      await storage.deleteSession(session.id);
      ctx.navigate('#/history');
    }
  }

  root.append(h('div', { class: 'stack' },
    h('div', {},
      h('h1', { style: { marginBottom: '2px' } }, session.workoutName),
      h('div', { class: 'muted small' }, fmtDate(session.startedAt))),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', {}, fmtTime(s.durationSec)), 'เวลา'),
      h('div', { class: 'stat' }, h('b', {}, dash(s.avg)), 'เฉลี่ย'),
      h('div', { class: 'stat' }, h('b', {}, dash(s.max)), 'สูงสุด'),
      h('div', { class: 'stat' }, h('b', {}, dash(s.min)), 'ต่ำสุด')),
    h('h2', {}, 'เวลาในแต่ละ Zone'),
    zoneCanvas,
    h('h2', {}, 'ชีพจรตามเวลา'),
    hrCanvas,
    h('div', { class: 'row' },
      h('button', { onclick: () => download(`${base}.csv`, toCsv(session), 'text/csv') }, icon('download'), 'CSV'),
      h('button', { onclick: () => download(`${base}.json`, JSON.stringify(session, null, 2), 'application/json') }, icon('download'), 'JSON'),
      h('span', { class: 'grow' }),
      h('button', { class: 'danger', onclick: remove }, icon('trash'), 'ลบ')),
    h('button', { class: 'primary', style: { width: '100%' }, onclick: () => ctx.navigate('#/history') }, 'ดูประวัติทั้งหมด'),
  ));

  const draw = () => {
    drawZoneBars(zoneCanvas, s.zoneSec, ctx.settings);
    drawHrChart(hrCanvas, session, ctx.settings);
  };
  draw();
  window.addEventListener('resize', draw);
  return () => window.removeEventListener('resize', draw);
}
