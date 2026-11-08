import { withDefaults } from './settings-defaults.js';
import { createFromTemplate } from './workout-model.js';

const DB_NAME = 'hr-trainer';
const SINGLETON = 'singleton';
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('settings');
        d.createObjectStore('checkpoint');
        d.createObjectStore('workouts', { keyPath: 'id' });
        d.createObjectStore('sessions', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getSettings() {
  return withDefaults((await run('settings', 'readonly', s => s.get(SINGLETON))) || {});
}
export const saveSettings = settings => run('settings', 'readwrite', s => s.put(settings, SINGLETON));

const byNewest = key => (a, b) => b[key] - a[key];

export async function listWorkouts() {
  return ((await run('workouts', 'readonly', s => s.getAll())) || []).sort(byNewest('updatedAt'));
}
export const getWorkout = id => run('workouts', 'readonly', s => s.get(id));
export const saveWorkout = w => run('workouts', 'readwrite', s => s.put(w));
export const deleteWorkout = id => run('workouts', 'readwrite', s => s.delete(id));

export async function listSessions() {
  const all = (await run('sessions', 'readonly', s => s.getAll())) || [];
  return all.map(({ samples, ...meta }) => meta).sort(byNewest('startedAt'));
}
export const getSession = id => run('sessions', 'readonly', s => s.get(id));
export const saveSession = sess => run('sessions', 'readwrite', s => s.put(sess));
export const deleteSession = id => run('sessions', 'readwrite', s => s.delete(id));

export async function getCheckpoint() {
  return (await run('checkpoint', 'readonly', s => s.get(SINGLETON))) ?? null;
}
export const saveCheckpoint = sess => run('checkpoint', 'readwrite', s => s.put(sess, SINGLETON));
export const clearCheckpoint = () => run('checkpoint', 'readwrite', s => s.delete(SINGLETON));

export async function ensureSeedWorkouts() {
  const existing = await listWorkouts();
  if (existing.length) return;
  const now = Date.now();
  for (const [i, key] of ['free', 'interval', 'tabata'].entries()) {
    await saveWorkout(createFromTemplate(key, now - i));
  }
}
