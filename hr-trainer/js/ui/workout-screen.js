import { h, fmtTime, ask } from './dom.js';
import { zoneFor, hrMaxFor, pctOfMax, ZoneDetector, ZONE_COLORS, ZONE_NAMES } from '../zones.js';
import { flattenWorkout } from '../workout-model.js';
import { WorkoutTimer } from '../workout-timer.js';
import { alertPlan, TargetMonitor } from '../alerts.js';
import { SessionRecorder } from '../session-recorder.js';
import { PipView } from '../pip.js';

const STALE_MS = 3000;
const STATUS_TEXT = { connected: 'เชื่อมต่อแล้ว', reconnecting: 'กำลังเชื่อมต่อใหม่…', disconnected: 'ไม่ได้เชื่อมต่อ' };

export async function mount(root, ctx) {
  const { storage } = ctx;
  const workouts = await storage.listWorkouts();
  let selectedId = ctx.params[0] || workouts[0]?.id;
  if (!workouts.some(w => w.id === selectedId)) selectedId = workouts[0]?.id;

  let lastHr = null;            // { bpm, t }
  let connState = ctx.source?.state ?? 'disconnected';
  let session = null;           // { timer, recorder, detector, monitor, workout }
  let wakeLock = null;
  let highUntil = 0, belowUntil = 0;
  const pip = PipView.isSupported() ? new PipView() : null;

  // ---------- DOM ----------
  const select = h('select', { onchange: () => { selectedId = select.value; } },
    workouts.map(w => h('option', { value: w.id, selected: w.id === selectedId }, w.name)));
  const dot = h('span', { class: 'dot' });
  const devName = h('span', { class: 'small' });
  const btnBle = h('button', { class: 'icon', title: 'เชื่อมต่อนาฬิกา', onclick: () => connect('ble') }, '⌚');
  const btnDemo = h('button', { class: 'icon', title: 'โหมดจำลอง', onclick: () => connect('demo') }, 'Demo');
  const zoneEl = h('div', { class: 'ws-zone' });
  const bpmEl = h('div', { class: 'ws-bpm' });
  const arrowEl = h('div', { class: 'ws-arrow' });
  const totalEl = h('div', { class: 'big' });
  const stepTimeEl = h('div', { class: 'big' });
  const stepEl = h('div', { class: 'ws-step' });
  const nextEl = h('div', { class: 'ws-next' });
  const bannerEl = h('div', { class: 'ws-banner', hidden: true });
  const popEl = h('div', { class: 'ws-pop' });
  const btnStart = h('button', { class: 'primary', onclick: start }, '▶ เริ่ม');
  const btnPause = h('button', { onclick: togglePause }, '⏸ พัก');
  const btnSkip = h('button', { onclick: skip }, '⏭ ข้าม');
  const btnStop = h('button', { onclick: stop }, '⏹ จบ');
  const btnMute = h('button', { class: 'icon', onclick: toggleMute });
  const btnPip = h('button', { class: 'icon hide-compact', title: 'หน้าต่างลอย', hidden: !pip, onclick: togglePip }, '⧉');

  const screen = h('div', { class: 'ws' },
    h('div', { class: 'ws-top' }, select, btnBle, btnDemo, dot),
    h('div', { class: 'row small hide-compact', style: { marginTop: '4px', justifyContent: 'flex-end' } }, devName),
    !ctx.bluetoothSupported && h('div', { class: 'ws-banner' },
      'เบราว์เซอร์นี้ใช้ Web Bluetooth ไม่ได้ — เปิดด้วย Chrome บน Android ผ่าน HTTPS หรือกด Demo เพื่อทดลอง'),
    zoneEl, bpmEl, arrowEl,
    h('div', { class: 'ws-times' },
      h('div', {}, totalEl, h('div', { class: 'lbl' }, 'เวลารวม')),
      h('div', {}, stepTimeEl, h('div', { class: 'lbl' }, 'ช่วงนี้'))),
    stepEl, nextEl, bannerEl,
    h('div', { class: 'ws-controls' }, btnStart, btnPause, btnSkip, btnStop, btnMute, btnPip),
    popEl,
  );
  root.append(screen);

  // ---------- Source ----------
  const onHr = e => { lastHr = { bpm: e.detail.bpm, t: Date.now() }; };
  const onStatus = e => {
    connState = e.detail.state;
    if (connState === 'disconnected' && session) fire({ type: 'disconnect' });
  };
  let bound = null;
  function bind(src) {
    if (bound === src) return;
    if (bound) {
      bound.removeEventListener('hr', onHr);
      bound.removeEventListener('status', onStatus);
    }
    bound = src;
    if (!src) return;
    src.addEventListener('hr', onHr);
    src.addEventListener('status', onStatus);
    connState = src.state;
  }
  bind(ctx.source);

  async function connect(kind) {
    await ctx.player.unlock();
    if (kind === 'ble' && !ctx.bluetoothSupported) return;
    const src = ctx.useSource(kind);
    bind(src);
    try {
      await src.connect();
    } catch (err) {
      if (err?.name !== 'NotFoundError') showBanner(`เชื่อมต่อไม่สำเร็จ: ${err?.message || err}`);
      else showBanner('ไม่พบนาฬิกา — เปิด "Heart rate sharing / broadcast" บนนาฬิกาก่อน (ดูวิธีในหน้าตั้งค่า)');
    }
  }

  // Silent reconnect to a previously paired watch on first open.
  if (!ctx.source && ctx.bluetoothSupported) {
    const src = ctx.useSource('ble');
    bind(src);
    src.reconnectKnown().catch(() => {});
  }

  // ---------- Alerts ----------
  function fire(event) {
    ctx.player.play(alertPlan(event, ctx.settings), ctx.flashEl);
  }
  function pop(text) {
    popEl.textContent = text;
    popEl.classList.add('show');
    clearTimeout(pop.t);
    pop.t = setTimeout(() => popEl.classList.remove('show'), 1500);
  }
  function showBanner(text, ms = 6000) {
    bannerEl.textContent = text;
    bannerEl.hidden = false;
    clearTimeout(showBanner.t);
    showBanner.t = setTimeout(() => { bannerEl.hidden = true; }, ms);
  }

  // ---------- Session ----------
  function currentBpm(now) {
    return lastHr && now - lastHr.t <= STALE_MS ? lastHr.bpm : null;
  }

  async function requestWakeLock() {
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch { /* not allowed (e.g. battery saver) */ }
  }
  const onVisibility = () => {
    if (document.visibilityState === 'visible' && session) requestWakeLock();
  };
  document.addEventListener('visibilitychange', onVisibility);

  async function start() {
    const workout = workouts.find(w => w.id === selectedId);
    if (!workout || session) return;
    await ctx.player.unlock();
    const now = Date.now();
    const recorder = new SessionRecorder({
      workoutId: workout.id,
      workoutName: workout.name,
      startedAt: now,
      onCheckpoint: snap => storage.saveCheckpoint(snap),
    });
    session = {
      workout,
      timer: new WorkoutTimer(flattenWorkout(workout)),
      recorder,
      detector: new ZoneDetector(),
      monitor: new TargetMonitor({ repeatSec: ctx.settings.zoneHighRepeatSec }),
      sampleIndex: 0,
    };
    document.body.classList.add('in-workout');
    handle(session.timer.start(now));
    requestWakeLock();
    tick();
  }

  function togglePause() {
    if (!session) return;
    const now = Date.now();
    if (session.timer.status === 'paused') session.timer.resume(now);
    else session.timer.pause(now);
    tick();
  }

  function skip() {
    if (session) handle(session.timer.skip(Date.now()));
  }

  async function stop() {
    if (!session) return;
    const v = await ask('จบการฝึกตอนนี้?', [
      { label: 'ฝึกต่อ', value: 'no', class: 'ghost' },
      { label: 'จบและบันทึก', value: 'yes', class: 'primary' },
    ]);
    if (v === 'yes' && session) handle(session.timer.stop(Date.now()));
  }

  async function finish() {
    const s = session;
    session = null;
    const endT = s.timer.getState(Date.now()).totalElapsedSec;
    const result = s.recorder.finish(Date.now(), Math.round(endT * 10) / 10);
    await storage.saveSession(result);
    await storage.clearCheckpoint();
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
    pip?.close();
    document.body.classList.remove('in-workout');
    ctx.navigate(`#/summary/${result.id}`);
  }

  function handle(events) {
    for (const e of events) {
      if (e.type === 'stepStart') {
        const t = session.timer.getState(Date.now()).totalElapsedSec;
        session.recorder.markStep({ name: e.step.name, kind: e.step.kind, startT: Math.round(t * 10) / 10 });
        session.monitor.reset();
        if (e.index > 0 || e.step.kind === 'work') fire({ type: 'stepStart', kind: e.step.kind });
        pop(e.step.name);
      } else if (e.type === 'countdown') {
        fire(e);
      } else if (e.type === 'finished') {
        finish();
        return;
      }
    }
  }

  function toggleMute() {
    ctx.saveSettings({ ...ctx.settings, muted: !ctx.settings.muted });
    tick();
  }

  async function togglePip() {
    if (!pip) return;
    try {
      if (pip.isOpen) await pip.close();
      else await pip.open();
    } catch (err) {
      showBanner(`เปิดหน้าต่างลอยไม่ได้: ${err?.message || err}`);
    }
  }

  // 1 Hz: sample, zone detection, target monitoring.
  function everySecond() {
    if (!session || session.timer.status !== 'running') return;
    const now = Date.now();
    const bpm = currentBpm(now);
    const hrMax = hrMaxFor(ctx.settings);
    const zone = bpm == null ? 0 : zoneFor(bpm, hrMax, ctx.settings.zoneBounds);
    const st = session.timer.getState(now);
    session.recorder.addSample({ t: session.sampleIndex++, bpm, zone, stepIndex: st.stepIndex });
    if (bpm == null) return;
    const change = session.detector.update(zone, now);
    if (change) {
      fire({ type: change.to > change.from ? 'zoneUp' : 'zoneDown' });
      pop(ZONE_NAMES[change.to]);
    }
    for (const ev of session.monitor.update({ zone, targetZone: st.step?.targetZone ?? null, nowMs: now })) {
      fire(ev);
      if (ev.type === 'zoneHigh') highUntil = now + 2500;
      if (ev.type === 'belowTarget') belowUntil = now + 4000;
    }
  }

  // ---------- Render ----------
  function tick() {
    const now = Date.now();
    if (session) handle(session.timer.tick(now));
    const bpm = currentBpm(now);
    const hrMax = hrMaxFor(ctx.settings);
    const zone = bpm == null ? 0 : zoneFor(bpm, hrMax, ctx.settings.zoneBounds);

    screen.style.backgroundColor = ZONE_COLORS[zone];
    screen.classList.toggle('high-warn', now < highUntil);
    bpmEl.replaceChildren(bpm == null ? '--' : String(bpm), h('small', {}, ' bpm'));
    zoneEl.replaceChildren(ZONE_NAMES[zone], bpm == null ? '' : h('span', { class: 'pct' }, ` · ${pctOfMax(bpm, hrMax)}%`));
    arrowEl.textContent = now < belowUntil ? '⬆ เร่งขึ้น' : '';
    dot.className = `dot ${connState}`;
    devName.textContent = `${bound?.deviceName ?? ''} ${STATUS_TEXT[connState]}`.trim();

    const running = !!session;
    const st = session?.timer.getState(now);
    select.disabled = running;
    btnBle.hidden = running || !ctx.bluetoothSupported;
    btnDemo.hidden = running;
    btnStart.hidden = running;
    btnPause.hidden = btnSkip.hidden = btnStop.hidden = !running;
    btnPause.textContent = st?.status === 'paused' ? '▶ ต่อ' : '⏸ พัก';
    btnMute.textContent = ctx.settings.muted ? '🔇' : '🔊';

    if (st) {
      totalEl.textContent = fmtTime(st.totalElapsedSec);
      stepTimeEl.textContent = st.stepRemainingSec == null ? fmtTime(st.stepElapsedSec) : fmtTime(Math.ceil(st.stepRemainingSec));
      const round = st.step.rounds ? ` ${st.step.round}/${st.step.rounds}` : '';
      stepEl.textContent = `${st.step.name}${round}${st.status === 'paused' ? ' (พัก)' : ''}`;
      nextEl.textContent = st.nextStep ? `ถัดไป: ${st.nextStep.name}` : 'ช่วงสุดท้าย';
    } else {
      const w = workouts.find(x => x.id === selectedId);
      totalEl.textContent = '00:00';
      stepTimeEl.textContent = '--:--';
      stepEl.textContent = w ? w.name : 'ยังไม่มีโปรแกรม';
      nextEl.textContent = 'กด ▶ เริ่ม เมื่อพร้อม';
    }

    pip?.render({
      bpm,
      zone,
      stepName: st ? st.step.name : 'พร้อม',
      stepRemainingSec: st ? st.stepRemainingSec ?? st.stepElapsedSec : null,
      totalElapsedSec: st ? st.totalElapsedSec : 0,
      connection: connState,
    });
  }

  const fast = setInterval(tick, 250);
  const slow = setInterval(everySecond, 1000);
  tick();

  return () => {
    clearInterval(fast);
    clearInterval(slow);
    document.removeEventListener('visibilitychange', onVisibility);
    bind(null);
    if (session) storage.saveCheckpoint(session.recorder.snapshot());
    wakeLock?.release?.().catch(() => {});
    pip?.close();
  };
}
