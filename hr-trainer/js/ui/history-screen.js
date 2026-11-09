import { h, fmtTime, fmtDate, confirmDelete, icon } from './dom.js';

export async function mount(root, ctx) {
  const { storage } = ctx;

  async function render() {
    const list = await storage.listSessions();
    root.replaceChildren(h('div', {},
      h('h1', {}, 'ประวัติการฝึก'),
      list.length === 0 && h('p', { class: 'muted' }, 'ยังไม่มีประวัติ — เริ่มฝึกจากแท็บ "ฝึก"'),
      h('div', { class: 'list' }, list.map(sess =>
        h('div', { class: 'card row', style: { cursor: 'pointer' }, onclick: () => ctx.navigate(`#/summary/${sess.id}`) },
          h('div', { class: 'grow' },
            h('b', {}, sess.workoutName),
            h('div', { class: 'muted small' }, fmtDate(sess.startedAt))),
          h('div', { style: { textAlign: 'right' } },
            h('div', {}, fmtTime(sess.summary?.durationSec ?? 0)),
            h('div', { class: 'muted small' }, sess.summary?.avg == null ? '— bpm' : `เฉลี่ย ${sess.summary.avg} bpm`)),
          h('button', {
            class: 'icon ghost',
            title: 'ลบ',
            onclick: async e => {
              e.stopPropagation();
              if (await confirmDelete(`"${sess.workoutName}" (${fmtDate(sess.startedAt)})`)) {
                await storage.deleteSession(sess.id);
                render();
              }
            },
          }, icon('trash'))),
      )),
    ));
  }

  await render();
}
