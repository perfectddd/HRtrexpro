// Tiny hyperscript helper: h('button', { class: 'x', onclick }, 'text', child)
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// Line icons (24×24, stroke = currentColor). Strings starting with "c" are circles "c cx cy r".
const ICONS = {
  play: ['M7 4.5v15l12.5-7.5z'],
  pause: ['M7 5h3v14H7z', 'M14 5h3v14h-3z'],
  skip: ['M5 5.5v13l10-6.5z', 'M19 5v14'],
  stop: ['M6.5 6.5h11v11h-11z'],
  watch: ['c 12 12 5.5', 'M9 6.8V3h6v3.8', 'M9 17.2V21h6v-3.8', 'M12 9.5V12l1.8 1.2'],
  volume: ['M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z', 'M15.5 9a4.2 4.2 0 0 1 0 6', 'M18.5 6.5a8 8 0 0 1 0 11'],
  mute: ['M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z', 'M16 9.5l5 5', 'M21 9.5l-5 5'],
  pip: ['M3.5 5.5h17v13h-17z', 'M12 12h6v4h-6z'],
  heart: ['M12 19.5s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.3c0 5.6-7.5 10.2-7.5 10.2z'],
  list: ['M9 6.5h11', 'M9 12h11', 'M9 17.5h11', 'M4.5 6.5h.01', 'M4.5 12h.01', 'M4.5 17.5h.01'],
  chart: ['M4 20h16', 'M6.5 16v-5', 'M11 16V6', 'M15.5 16v-8', 'M20 16v-3'],
  sliders: ['M4 7h9', 'M17 7h3', 'c 15 7 2', 'M4 17h3', 'M11 17h9', 'c 9 17 2'],
  plus: ['M12 5v14', 'M5 12h14'],
  edit: ['M4 20h4L19.5 8.5l-4-4L4 16z', 'M13.5 6.5l4 4'],
  copy: ['M8.5 8.5h11v11h-11z', 'M15.5 8.5v-4h-11v11h4'],
  trash: ['M4.5 7h15', 'M10 11v6', 'M14 11v6', 'M6.5 7l1 13h9l1-13', 'M9.5 7V4h5v3'],
  download: ['M12 4v11', 'M7.5 11l4.5 4.5 4.5-4.5', 'M4.5 20h15'],
  clock: ['c 12 12 8', 'M12 8v4.2l2.8 1.8'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'c 12 12 2.8'],
  up: ['M12 19V5', 'M6 11l6-6 6 6'],
  down: ['M12 5v14', 'M6 13l6 6 6-6'],
  bolt: ['M13 3L5 13.5h6L10 21l8-10.5h-6z'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
};

export function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] || []) {
    if (d.startsWith('c ')) {
      const [cx, cy, r] = d.slice(2).split(' ');
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
      svg.append(c);
    } else {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.append(p);
    }
  }
  return svg;
}

export function fmtTime(sec) {
  if (sec == null) return '--:--';
  const s = Math.max(0, Math.floor(sec));
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtDate(ms) {
  return new Date(ms).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

// Promise-based dialog using the <dialog id="dialog"> in index.html.
export function ask(message, buttons) {
  const dlg = document.getElementById('dialog');
  document.getElementById('dialog-msg').textContent = message;
  const row = document.getElementById('dialog-btns');
  row.replaceChildren(...buttons.map(b => h('button', { value: b.value, class: b.class || '' }, b.label)));
  // Reset so a cancel (Esc / Android back) never reuses the previous answer.
  dlg.returnValue = '';
  return new Promise(resolve => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true });
    dlg.showModal();
  });
}

export const confirmDelete = what =>
  ask(`ลบ${what}? การลบกู้คืนไม่ได้`, [
    { label: 'ยกเลิก', value: 'no', class: 'ghost' },
    { label: 'ลบ', value: 'yes', class: 'danger' },
  ]).then(v => v === 'yes');

export function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
