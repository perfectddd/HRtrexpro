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
