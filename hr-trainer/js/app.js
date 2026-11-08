import * as storage from './storage.js';
import { AlertPlayer } from './alerts.js';
import { BleHeartRateSource, DemoSource, isBluetoothSupported } from './hr-source.js';
import { SessionRecorder } from './session-recorder.js';
import { ask } from './ui/dom.js';
import * as workoutScreen from './ui/workout-screen.js';
import * as workoutsScreen from './ui/workouts-screen.js';
import * as builderScreen from './ui/builder-screen.js';
import * as summaryScreen from './ui/summary-screen.js';
import * as historyScreen from './ui/history-screen.js';
import * as settingsScreen from './ui/settings-screen.js';

const ROUTES = {
  workout: workoutScreen,
  workouts: workoutsScreen,
  builder: builderScreen,
  summary: summaryScreen,
  history: historyScreen,
  settings: settingsScreen,
};

const root = document.getElementById('app');
let unmount = null;

const ctx = {
  storage,
  settings: null,
  player: new AlertPlayer(),
  source: null,
  bluetoothSupported: isBluetoothSupported(),
  flashEl: document.getElementById('flash'),
  params: [],

  navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },

  async saveSettings(next) {
    ctx.settings = next;
    await storage.saveSettings(next);
  },

  // Returns the shared source of the requested kind, replacing the old one.
  useSource(kind) {
    const want = kind === 'demo' ? DemoSource : BleHeartRateSource;
    if (!(ctx.source instanceof want)) {
      ctx.source?.disconnect();
      ctx.source = new want();
    }
    return ctx.source;
  },
};

function parseHash() {
  const [name, ...params] = (location.hash.replace(/^#\/?/, '') || 'workout').split('/');
  return { name: ROUTES[name] ? name : 'workout', params: params.map(decodeURIComponent) };
}

async function render() {
  const { name, params } = parseHash();
  unmount?.();
  unmount = null;
  document.body.classList.remove('in-workout');
  document.body.classList.toggle('route-workout', name === 'workout');
  root.replaceChildren();
  ctx.params = params;
  for (const a of document.querySelectorAll('#nav a')) {
    const active = a.dataset.route === name || (name === 'builder' && a.dataset.route === 'workouts') || (name === 'summary' && a.dataset.route === 'history');
    a.classList.toggle('active', active);
  }
  unmount = (await ROUTES[name].mount(root, ctx)) || null;
}

async function offerRecovery() {
  const cp = await storage.getCheckpoint();
  if (!cp) return;
  const choice = await ask(
    `พบการฝึก "${cp.workoutName}" ที่ค้างอยู่ (${cp.samples.length} วินาที) ต้องการกู้คืนไหม?`,
    [
      { label: 'ทิ้ง', value: 'discard', class: 'ghost' },
      { label: 'กู้คืน', value: 'restore', class: 'primary' },
    ],
  );
  if (choice === 'restore') {
    const rec = SessionRecorder.fromCheckpoint(cp);
    const last = cp.samples.at(-1);
    const endedAt = cp.startedAt + ((last?.t ?? 0) + 1) * 1000;
    const session = rec.finish(endedAt);
    await storage.saveSession(session);
    await storage.clearCheckpoint();
    ctx.navigate(`#/summary/${session.id}`);
  } else {
    await storage.clearCheckpoint();
  }
}

async function init() {
  ctx.settings = await storage.getSettings();
  await storage.ensureSeedWorkouts();
  window.addEventListener('hashchange', render);
  await render();
  await offerRecovery();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  }
}

init();
