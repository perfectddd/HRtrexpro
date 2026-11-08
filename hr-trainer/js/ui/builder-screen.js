import { h, fmtTime } from './dom.js';
import { validateWorkout, totalDurationSec, makeStep, KIND_COLORS, KIND_LABELS } from '../workout-model.js';

const KINDS = Object.keys(KIND_LABELS);

function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

export async function mount(root, ctx) {
  const { storage } = ctx;
  const original = await storage.getWorkout(ctx.params[0]);
  if (!original) {
    root.replaceChildren(h('p', {}, 'ไม่พบโปรแกรมนี้'), h('button', { onclick: () => ctx.navigate('#/workouts') }, 'กลับ'));
    return;
  }
  const draft = structuredClone(original);
  const totalEl = h('span', { class: 'muted' });
  const errorsEl = h('div', { class: 'errors', hidden: true });
  const listEl = h('div');

  function updateTotal() {
    const { sec, hasOpen } = totalDurationSec(draft);
    totalEl.textContent = `รวม ${fmtTime(sec)}${hasOpen ? ' + ช่วงเปิด' : ''}`;
  }

  function stepEditor(step, arr, i, inner) {
    const minIn = h('input', { type: 'number', min: 0, inputmode: 'numeric', value: step.durationSec == null ? '' : Math.floor(step.durationSec / 60) });
    const secIn = h('input', { type: 'number', min: 0, max: 59, inputmode: 'numeric', value: step.durationSec == null ? '' : step.durationSec % 60 });
    const openCb = h('input', { type: 'checkbox', checked: step.durationSec == null });
    const syncDur = () => {
      minIn.disabled = secIn.disabled = openCb.checked;
      step.durationSec = openCb.checked ? null : (Number(minIn.value) || 0) * 60 + (Number(secIn.value) || 0);
      updateTotal();
    };
    minIn.oninput = secIn.oninput = syncDur;
    openCb.onchange = () => {
      if (!openCb.checked && !minIn.value && !secIn.value) secIn.value = 30;
      syncDur();
    };
    minIn.disabled = secIn.disabled = openCb.checked;

    const zoneSel = (val, onChange) => h('select', { onchange: e => onChange(e.target.value) },
      h('option', { value: '' }, '–'),
      [1, 2, 3, 4, 5].map(z => h('option', { value: z, selected: val === z }, `Z${z}`)));
    const setZone = (which, v) => {
      const tz = step.targetZone ?? { min: 1, max: 5 };
      if (v === '') {
        if (which === 'min') step.targetZone = null;
        else step.targetZone = step.targetZone ? { ...tz, max: 5 } : null;
      } else {
        step.targetZone = { ...tz, [which]: Number(v) };
      }
      render();
    };

    const colorIn = h('input', { type: 'color', value: step.color, oninput: e => { step.color = e.target.value; card.style.borderLeftColor = step.color; } });
    const nameIn = h('input', { value: step.name, oninput: e => { step.name = e.target.value; } });
    const kindSel = h('select', {
      onchange: e => {
        const wasDefaultName = step.name === KIND_LABELS[step.kind];
        step.kind = e.target.value;
        step.color = KIND_COLORS[step.kind];
        if (wasDefaultName) step.name = KIND_LABELS[step.kind];
        render();
      },
    }, KINDS.map(k => h('option', { value: k, selected: k === step.kind }, KIND_LABELS[k])));

    const card = h('div', { class: 'item', style: { borderLeftColor: step.color } },
      h('div', { class: 'row' },
        h('b', { class: 'grow' }, inner ? `  ↳ ขั้นตอน ${i + 1}` : `ขั้นตอน ${i + 1}`),
        h('button', { class: 'icon ghost', onclick: () => { move(arr, i, -1); render(); } }, '↑'),
        h('button', { class: 'icon ghost', onclick: () => { move(arr, i, 1); render(); } }, '↓'),
        h('button', { class: 'icon ghost', onclick: () => { arr.splice(i, 1); render(); } }, '✕')),
      h('div', { class: 'fields' },
        h('label', {}, 'ชื่อ', nameIn),
        h('label', {}, 'ประเภท', kindSel),
        h('label', {}, 'ระยะเวลา (นาที : วินาที)', h('div', { class: 'dur' }, minIn, ':', secIn)),
        h('label', { class: 'inline' }, openCb, 'จนกว่าจะกดถัดไป'),
        h('label', {}, 'Zone เป้าหมาย (ต่ำสุด – สูงสุด)',
          h('div', { class: 'row' },
            zoneSel(step.targetZone?.min ?? null, v => setZone('min', v)),
            '–',
            zoneSel(step.targetZone ? step.targetZone.max : null, v => setZone('max', v)))),
        h('label', {}, 'สี', colorIn)),
    );
    return card;
  }

  function repeatEditor(rep, i) {
    const timesIn = h('input', {
      type: 'number', min: 1, inputmode: 'numeric', value: rep.times,
      oninput: e => { rep.times = Math.floor(Number(e.target.value)) || 0; updateTotal(); },
    });
    return h('div', { class: 'item repeat' },
      h('div', { class: 'row' },
        h('b', { class: 'grow' }, `ทำซ้ำ (ขั้นตอน ${i + 1})`),
        h('label', {}, timesIn, 'รอบ'),
        h('button', { class: 'icon ghost', onclick: () => { move(draft.items, i, -1); render(); } }, '↑'),
        h('button', { class: 'icon ghost', onclick: () => { move(draft.items, i, 1); render(); } }, '↓'),
        h('button', { class: 'icon ghost', onclick: () => { draft.items.splice(i, 1); render(); } }, '✕')),
      h('div', { class: 'inner' },
        rep.items.map((s, j) => stepEditor(s, rep.items, j, true)),
        h('button', { class: 'ghost', style: { marginTop: '8px' }, onclick: () => { rep.items.push(makeStep('work', 30)); render(); } }, '+ ขั้นตอนในบล็อก')),
    );
  }

  function render() {
    listEl.replaceChildren(...draft.items.map((item, i) => (item.type === 'repeat' ? repeatEditor(item, i) : stepEditor(item, draft.items, i, false))));
    updateTotal();
  }

  async function save() {
    const errors = validateWorkout(draft);
    if (errors.length) {
      errorsEl.replaceChildren(h('b', {}, 'แก้ไขก่อนบันทึก:'), h('ul', {}, errors.map(e => h('li', {}, e))));
      errorsEl.hidden = false;
      errorsEl.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    draft.updatedAt = Date.now();
    await storage.saveWorkout(draft);
    ctx.navigate('#/workouts');
  }

  root.append(
    h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('h1', { class: 'grow' }, 'แก้ไขโปรแกรม'), totalEl),
      h('label', { style: { width: '100%' } }, 'ชื่อ',
        h('input', { class: 'grow', value: draft.name, oninput: e => { draft.name = e.target.value; } })),
      listEl,
      h('div', { class: 'row' },
        h('button', { onclick: () => { draft.items.push(makeStep('work', 60)); render(); } }, '+ เพิ่มขั้นตอน'),
        h('button', {
          onclick: () => {
            draft.items.push({ type: 'repeat', times: 4, items: [makeStep('work', 30), makeStep('rest', 15)] });
            render();
          },
        }, '+ เพิ่มบล็อกทำซ้ำ')),
      errorsEl,
      h('div', { class: 'row' },
        h('button', { class: 'ghost grow', onclick: () => ctx.navigate('#/workouts') }, 'ยกเลิก'),
        h('button', { class: 'primary grow', onclick: save }, '💾 บันทึก')),
    ),
  );
  render();
}
