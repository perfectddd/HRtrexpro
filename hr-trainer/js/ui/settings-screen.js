import { h, icon } from './dom.js';
import { hrMaxFor, ZONE_NAMES, ZONE_PRESETS } from '../zones.js';
import { alertPlan } from '../alerts.js';
import { ALERT_KEYS, DEFAULT_SETTINGS, withDefaults, boundsError } from '../settings-defaults.js';
import { BleHeartRateSource } from '../hr-source.js';
import { parseAuthKey } from '../huami-auth.js';

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
  // Zone rows: colour picker + name + bpm range (range text refreshed by refreshDerived).
  const rangeEls = [];
  const colorInputs = [];
  const zoneRows = [1, 2, 3, 4, 5].map(z => {
    const range = h('span', { class: 'muted small num' });
    const picker = h('input', {
      type: 'color', value: draft.zoneColors[z], 'aria-label': `สี Z${z}`,
      oninput: e => { draft.zoneColors[z] = e.target.value; refreshPresets(); },
    });
    rangeEls[z] = range;
    colorInputs[z] = picker;
    return h('div', { class: 'zone-row' }, picker, h('span', { class: 'name' }, ZONE_NAMES[z]), range);
  });
  const presetButtons = Object.entries(ZONE_PRESETS).map(([key, p]) => {
    const btn = h('button', {
      class: 'preset', type: 'button',
      onclick: () => {
        draft.zoneColors = [...p.colors];
        colorInputs.forEach((inp, z) => { if (inp) inp.value = draft.zoneColors[z]; });
        refreshPresets();
      },
    }, h('div', { class: 'swatches' }, p.colors.slice(1).map(c => h('span', { style: { background: c } }))), p.label);
    btn.dataset.key = key;
    return btn;
  });
  function refreshPresets() {
    for (const btn of presetButtons) {
      const colors = ZONE_PRESETS[btn.dataset.key].colors;
      btn.classList.toggle('on', colors.every((c, i) => c.toLowerCase() === draft.zoneColors[i].toLowerCase()));
    }
  }

  function refreshDerived() {
    const hrMax = hrMaxFor(draft);
    hrMaxEl.textContent = Number.isFinite(hrMax) ? `${hrMax} bpm` : '—';
    for (let z = 1; z <= 5; z++) {
      const lo = Math.round((draft.zoneBounds[z - 1] / 100) * hrMax);
      const hi = Math.round((draft.zoneBounds[z] / 100) * hrMax) - 1;
      rangeEls[z].textContent = z === 5 ? `${lo}+ bpm` : `${lo}–${hi} bpm`;
    }
    hrIn.disabled = !draft.hrMaxManual;
  }

  const num = (value, onInput, attrs = {}) => h('input', { type: 'number', inputmode: 'numeric', value, oninput: e => { onInput(Number(e.target.value)); refreshDerived(); }, ...attrs });
  const ageIn = num(draft.age, v => { draft.age = v; }, { min: 10, max: 100 });
  const hrIn = num(draft.hrMax, v => { draft.hrMax = v; }, { min: 100, max: 230 });
  const manualCb = h('input', { type: 'checkbox', checked: draft.hrMaxManual, onchange: e => { draft.hrMaxManual = e.target.checked; refreshDerived(); } });
  const boundInputs = draft.zoneBounds.map((b, i) => num(b, v => { draft.zoneBounds[i] = v; }, { min: 1, max: 120, style: { width: '64px' } }));

  const keyStatus = h('div', { class: 'small' });
  function updateKeyStatus() {
    const v = draft.authKey.trim();
    if (!v) { keyStatus.textContent = 'ยังไม่ได้ใส่ key'; keyStatus.style.color = 'var(--warn)'; }
    else if (parseAuthKey(v)) { keyStatus.textContent = 'รูปแบบ key ถูกต้อง ✓'; keyStatus.style.color = 'var(--ok)'; }
    else { keyStatus.textContent = 'ต้องเป็นเลขฐาน 16 จำนวน 32 ตัว'; keyStatus.style.color = 'var(--danger)'; }
  }
  const keyIn = h('input', {
    type: 'password', class: 'grow', value: draft.authKey, autocomplete: 'off', spellcheck: false,
    style: { fontFamily: 'monospace' },
    oninput: e => { draft.authKey = e.target.value; updateKeyStatus(); },
  });

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
    }, icon('play'))),
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
    if (draft.authKey.trim() && !parseAuthKey(draft.authKey)) return flash('auth key ต้องเป็นเลขฐาน 16 จำนวน 32 ตัว', false);
    draft.authKey = draft.authKey.trim();
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
      h('h2', {}, 'สี Zone'),
      h('div', {}, zoneRows),
      h('div', { class: 'muted small' }, 'ชุดสีสำเร็จรูป'),
      h('div', { class: 'presets' }, presetButtons),
      h('div', { class: 'muted small' }, 'สีนี้ใช้กับวงแหวนชีพจร, พื้นหลังหน้าต่างลอย (PiP) และกราฟ')),

    h('div', { class: 'card stack' },
      h('h2', {}, 'ขอบเขต Zone (% ของ HRmax)'),
      h('div', { class: 'row' }, boundInputs.map((inp, i) => h('label', { class: 'small' }, i < 5 ? `Z${i + 1}≥` : 'max', inp))),
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

    h('div', { class: 'card stack' },
      h('h2', {}, 'นาฬิกา (Amazfit T-Rex Pro)'),
      h('label', { style: { flexDirection: 'column', alignItems: 'stretch', width: '100%' } }, 'Auth key (hex 32 ตัวอักษร)',
        h('div', { class: 'row' }, keyIn, h('button', { class: 'icon ghost', onclick: () => { keyIn.type = keyIn.type === 'password' ? 'text' : 'password'; } }, icon('eye')))),
      keyStatus,
      h('label', {}, h('input', { type: 'checkbox', checked: draft.authCrypt, onchange: e => { draft.authCrypt = e.target.checked; } }), 'ใช้ crypt flag 0x80 (T-Rex Pro ต้องเปิด)'),
      h('div', { class: 'small' },
        h('b', {}, 'วิธีหา auth key จากแอป Zepp'),
        h('ol', {},
          h('li', {}, 'Zepp → โปรไฟล์ (มุมขวาบน) → Settings → About'),
          h('li', {}, 'แตะโลโก้ Zepp 10 ครั้ง → Network diagnostics → รอสักครู่'),
          h('li', {}, 'Share logs → ส่งให้ Notify for smartwatch (หรือเก็บไฟล์ไว้แล้วค้นหาค่า auth key)')),
        h('b', {}, 'ระหว่างฝึก'),
        h('ul', {},
          h('li', {}, 'ปิด Bluetooth มือถือ (หรือให้ Zepp หลุด) — นาฬิกาเชื่อมต่อได้ทีละเครื่อง'),
          h('li', {}, 'กด ⌚ ในหน้าฝึก แล้วเลือก Amazfit T-Rex Pro')),
        h('div', { class: 'muted' }, 'key เก็บไว้ในเครื่องนี้เท่านั้น ห้ามรีเซ็ตหรือ unpair นาฬิกา เพราะ key จะเปลี่ยน')),
      h('button', { class: 'ghost', onclick: forget }, 'ลืมนาฬิกาที่เคยเชื่อมต่อ')),

    statusEl,
    h('button', { class: 'primary', style: { width: '100%' }, onclick: save }, icon('check'), 'บันทึกการตั้งค่า'),
  ));
  updateKeyStatus();
  refreshDerived();
  refreshPresets();
}
