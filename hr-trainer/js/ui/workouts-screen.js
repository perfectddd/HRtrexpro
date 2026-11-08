import { h, fmtTime, ask, confirmDelete } from './dom.js';
import { createFromTemplate, totalDurationSec, makeStep } from '../workout-model.js';

function durationLabel(w) {
  const { sec, hasOpen } = totalDurationSec(w);
  if (!sec && hasOpen) return 'ไม่จำกัดเวลา';
  return fmtTime(sec) + (hasOpen ? ' + ช่วงเปิด' : '');
}

export async function mount(root, ctx) {
  const { storage } = ctx;

  async function createNew() {
    const choice = await ask('สร้างโปรแกรมใหม่จาก', [
      { label: 'ว่าง', value: 'blank', class: 'ghost' },
      { label: 'Interval', value: 'interval' },
      { label: 'Tabata', value: 'tabata' },
    ]);
    if (!choice) return;
    const now = Date.now();
    let w;
    if (choice === 'blank') {
      w = { ...createFromTemplate('free', now), name: 'โปรแกรมใหม่', items: [makeStep('work', 60)] };
    } else {
      w = createFromTemplate(choice, now);
      w.name = `${w.name} (ใหม่)`;
    }
    await storage.saveWorkout(w);
    ctx.navigate(`#/builder/${w.id}`);
  }

  async function duplicate(w) {
    const now = Date.now();
    const copy = { ...structuredClone(w), id: createFromTemplate('free', now).id, name: `${w.name} (สำเนา)`, createdAt: now, updatedAt: now };
    await storage.saveWorkout(copy);
    render();
  }

  async function remove(w) {
    if (await confirmDelete(`โปรแกรม "${w.name}"`)) {
      await storage.deleteWorkout(w.id);
      render();
    }
  }

  async function render() {
    const list = await storage.listWorkouts();
    root.replaceChildren(h('div', {},
      h('div', { class: 'row' }, h('h1', { class: 'grow' }, 'โปรแกรมฝึก'), h('button', { class: 'primary', onclick: createNew }, '+ ใหม่')),
      list.length === 0 && h('p', { class: 'muted' }, 'ยังไม่มีโปรแกรม กด "+ ใหม่" เพื่อสร้าง'),
      h('div', { class: 'list' }, list.map(w =>
        h('div', { class: 'card' },
          h('div', { class: 'row' },
            h('div', { class: 'grow' }, h('h2', { style: { marginBottom: '2px' } }, w.name), h('div', { class: 'muted small' }, durationLabel(w))),
            h('button', { class: 'primary', onclick: () => ctx.navigate(`#/workout/${w.id}`) }, '▶ เริ่ม')),
          h('div', { class: 'row', style: { marginTop: '10px' } },
            h('button', { class: 'ghost', onclick: () => ctx.navigate(`#/builder/${w.id}`) }, '✏️ แก้'),
            h('button', { class: 'ghost', onclick: () => duplicate(w) }, '⧉ ทำสำเนา'),
            h('button', { class: 'ghost', onclick: () => remove(w) }, '🗑 ลบ'))),
      )),
    ));
  }

  await render();
}
