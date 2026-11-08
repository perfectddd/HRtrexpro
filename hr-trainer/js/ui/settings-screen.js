import { h } from './dom.js';
import { hrMaxFor, ZONE_COLORS } from '../zones.js';
import { alertPlan } from '../alerts.js';
import { ALERT_KEYS, DEFAULT_SETTINGS, withDefaults, boundsError } from '../settings-defaults.js';
import { BleHeartRateSource } from '../hr-source.js';

const ALERT_LABELS = {
  countdown: 'นับถอยหลัง 3-2-1',
  stepChange: 'เปลี่ยนช่วง (ทำงาน/พัก)',
  zoneChange: 'เปลี่ยน Zone',
  zoneHigh: 'Z5 / เกินเป้า',
  belowTarget: 'ต่ำกว่าเป้า',
  disconnect: 'นาฬิกาหลุด',
};
const SAMPLE_EVENT = {
  countdown: { type: 'countdown', n: 3 },
  stepChange: { type: 'stepStart', kind: 'work' },
  zoneChange: { type: 'zoneUp' },
  zoneHigh: { type: 'zoneHigh' },
  belowTarget: { type: 'belowTarget' },
  disconnect: { type: 'disconnect' },
};
const CHANNELS = [['sound', '🔊'], ['vibrate', '📳'], ['flash', '💡']];

export async function mount(root, ctx) {
  const draft = withDefaults(structuredClone(ctx.settings));
  const statusEl = h('div', { class: 'small', hidden: true });
  const hrMaxEl = h('b');
  const zonePreview = h('div', { class: 'small' });

  function refreshDerived() {
    const hrMax = hrMaxFor(draft);
    hrMaxEl.textContent = Number.isFinite(hrMax) ? `${hrMax} bpm` : '—';
    zonePreview.replaceChildren(...[1, 2, 3, 4, 5].map(z => {
      const lo = Math.round((draft.zoneBounds[z - 1] / 100) * hrMax);
      const hi = Math.round((draft.zoneBounds[z] / 100) * hrMax) - 1;
      return h('div', { class: 'row', style: { gap: '6px' } },
        h('span', { class: 'dot', style: { background: ZONE_COLORS[z] } }), z === 5 ? `Z5: ${lo}+ bpm` : `Z${z}: ${lo}–${hi} bpm`);
    }));
    hrIn.disabled = !draft.hrMaxManual;
  }

  const num = (value, onInput, attrs = {}) => h('input', { type: 'number', inputmode: 'numeric', value, oninput: e => { onInput(Number(e.target.value)); refreshDerived(); }, ...attrs });
  const ageIn = num(draft.age, v => { draft.age = v; }, { min: 10, max: 100 });
  const hrIn = num(draft.hrMax, v => { draft.hrMax = v; }, { min: 100, max: 230 });
  const manualCb = h('input', { type: 'checkbox', checked: draft.hrMaxManual, onchange: e => { draft.hrMaxManual = e.target.checked; refreshDerived(); } });
  const boundInputs = draft.zoneBounds.map((b, i) => num(b, v => { draft.zoneBounds[i] = v; }, { min: 1, max: 120, style: { width: '64px' } }));

  const alertRows = ALERT_KEYS.map(key => h('tr', {},
    h('td', {}, ALERT_LABELS[key]),
    CHANNELS.map(([ch]) => h('td', {}, h('input', {
      type: 'checkbox',
      checked: draft.alerts[key][ch],
      onchange: e => { draft.alerts[key][ch] = e.target.checked; },
    }))),
    h('td', {}, h('button', {
      class: 'icon ghost',
      onclick: async () => {
        await ctx.player.unlock();
        ctx.player.play(alertPlan(SAMPLE_EVENT[key], { ...draft, muted: false }), ctx.flashEl);
      },
    }, '▶')),
  ));

  function flash(msg, ok = true) {
    statusEl.textContent = msg;
    statusEl.style.color = ok ? 'var(--ok)' : 'var(--danger)';
    statusEl.hidden = false;
  }

  async function save() {
    const err = boundsError(draft.zoneBounds);
    if (err) return flash(err, false);
    if (!draft.hrMaxManual && !(draft.age >= 10 && draft.age <= 100)) return flash('อายุต้องอยู่ระหว่าง 10–100', false);
    if (draft.hrMaxManual && !(draft.hrMax >= 100 && draft.hrMax <= 230)) return flash('HRmax ต้องอยู่ระหว่าง 100–230', false);
    if (!(draft.zoneHighRepeatSec >= 3)) return flash('ช่วงเตือนซ้ำต้องอย่างน้อย 3 วินาที', false);
    await ctx.saveSettings(structuredClone(draft));
    flash('บันทึกแล้ว ✓');
  }

  async function forget() {
    const src = ctx.source instanceof BleHeartRateSource ? ctx.source : null;
    if (src) await src.forget();
    else if (navigator.bluetooth?.getDevices) {
      for (const d of await navigator.bluetooth.getDevices()) await d.forget?.();
    }
    flash('ลืมนาฬิกาที่เคยเชื่อมต่อแล้ว');
  }

  root.append(h('div', { class: 'stack' },
    h('h1', {}, 'ตั้งค่า'),

    h('div', { class: 'card stack' },
      h('h2', {}, 'ชีพจรสูงสุด (HRmax)'),
      h('div', { class: 'row' }, h('label', {}, 'อายุ', ageIn), h('label', {}, manualCb, 'กำหนด HRmax เอง'), hrIn),
      h('div', {}, 'HRmax ที่ใช้: ', hrMaxEl, h('span', { class: 'muted small' }, ' (220 − อายุ ถ้าไม่ได้กำหนดเอง)'))),

    h('div', { class: 'card stack' },
      h('h2', {}, 'ขอบเขต Zone (% ของ HRmax)'),
      h('div', { class: 'row' }, boundInputs.map((inp, i) => h('label', { class: 'small' }, i < 5 ? `Z${i + 1}≥` : 'max', inp))),
      zonePreview,
      h('button', {
        class: 'ghost',
        onclick: () => {
          draft.zoneBounds = [...DEFAULT_SETTINGS.zoneBounds];
          boundInputs.forEach((inp, i) => { inp.value = draft.zoneBounds[i]; });
          refreshDerived();
        },
      }, 'คืนค่าเริ่มต้น')),

    h('div', { class: 'card stack' },
      h('h2', {}, 'การแจ้งเตือน'),
      h('label', {}, h('input', { type: 'checkbox', checked: draft.muted, onchange: e => { draft.muted = e.target.checked; } }), 'ปิดเสียงทั้งหมด'),
      h('table', { class: 'alerts' },
        h('thead', {}, h('tr', {}, h('th', {}, 'เหตุการณ์'), CHANNELS.map(([, icon]) => h('th', {}, icon)), h('th', {}, 'ทดสอบ'))),
        h('tbody', {}, alertRows)),
      h('label', {}, 'เตือนซ้ำเมื่ออยู่ Z5 / เกินเป้าทุก',
        num(draft.zoneHighRepeatSec, v => { draft.zoneHighRepeatSec = v; }, { min: 3, max: 120 }), 'วินาที')),

    statusEl,
    h('button', { class: 'primary', style: { width: '100%' }, onclick: save }, '💾 บันทึกการตั้งค่า'),

    h('div', { class: 'card stack' },
      h('h2', {}, 'นาฬิกา'),
      h('div', { class: 'small' },
        h('b', {}, 'วิธีเปิดการส่งชีพจร (Heart Rate Broadcast) บน T-Rex Pro'),
        h('ol', {},
          h('li', {}, 'เปิดแอป Zepp → โปรไฟล์ → เลือก T-Rex Pro'),
          h('li', {}, 'หาเมนู "แชร์อัตราการเต้นหัวใจ / Heart rate sharing" (บางเวอร์ชันอยู่ในการตั้งค่าออกกำลังกาย) แล้วเปิด'),
          h('li', {}, 'บนนาฬิกา เริ่มโหมดออกกำลังกาย (เช่น Indoor / Free training) — นาฬิกาจะเริ่มส่งชีพจร'),
          h('li', {}, 'กลับมาที่แอปนี้ กด ⌚ แล้วเลือกนาฬิกา')),
        h('div', { class: 'muted' }, 'ชื่อเมนูอาจต่างกันตามเวอร์ชันเฟิร์มแวร์ หลังเปิดครั้งแรกแล้วไม่ต้องเปิด Zepp ระหว่างฝึก')),
      h('button', { class: 'ghost', onclick: forget }, 'ลืมนาฬิกาที่เคยเชื่อมต่อ')),
  ));
  refreshDerived();
}
