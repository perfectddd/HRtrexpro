import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCurrentTime, watchOffsetMs, formatClock, describeDrift } from '../js/watch-time.js';

const bytes = s => new Uint8Array(s.replace(/\s/g, '').match(/../g).map(x => parseInt(x, 16)));

test('parseCurrentTime: real T-Rex Pro packet', () => {
  assert.deepEqual(parseCurrentTime(bytes('ea 07 0b 09 14 06 25 01 00 00 1c')), {
    year: 2026, month: 11, day: 9, hour: 20, minute: 6, second: 37, dayOfWeek: 1, tzQuarterHours: 28,
  });
});

test('parseCurrentTime: negative timezone and short packet without tz', () => {
  assert.equal(parseCurrentTime(bytes('ea 07 0b 09 14 06 25 01 00 00 ec')).tzQuarterHours, -20);
  const p = parseCurrentTime(bytes('ea 07 0b 09 14 06 25'));
  assert.equal(p.dayOfWeek, null);
  assert.equal(p.tzQuarterHours, null);
});

test('parseCurrentTime rejects short or invalid packets', () => {
  assert.equal(parseCurrentTime(bytes('ea 07 0b')), null);
  assert.equal(parseCurrentTime(bytes('ea 07 0d 09 14 06 25')), null); // month 13
  assert.equal(parseCurrentTime(bytes('ea 07 0b 09 18 06 25')), null); // hour 24
  assert.equal(parseCurrentTime(null), null);
});

test('watchOffsetMs compensates for whole-second truncation', () => {
  const t = { year: 2026, month: 11, day: 9, hour: 20, minute: 6, second: 37 };
  const watchMs = new Date(2026, 10, 9, 20, 6, 37).getTime();
  // Read finished half a second into PC second 37 → watch shows same second → ~0 offset.
  assert.equal(watchOffsetMs(t, watchMs + 400, watchMs + 600), 0);
  // PC is 3 s ahead of the watch.
  assert.equal(watchOffsetMs(t, watchMs + 3400, watchMs + 3600), -3000);
});

test('formatClock shows HH:MM:SS of now + offset', () => {
  const now = new Date(2026, 10, 9, 20, 6, 37, 200).getTime();
  assert.equal(formatClock(now, 0), '20:06:37');
  assert.equal(formatClock(now, -3000), '20:06:34');
  assert.equal(formatClock(now, 65000), '20:07:42');
});

test('describeDrift ignores < 2 s and words slow/fast', () => {
  assert.equal(describeDrift(0), null);
  assert.equal(describeDrift(-1900), null);
  assert.equal(describeDrift(-3000), 'นาฬิกาช้า 3 วิ');
  assert.equal(describeDrift(4400), 'นาฬิกาเร็ว 4 วิ');
  assert.equal(describeDrift(-125000), 'นาฬิกาช้า 2 นาที 5 วิ');
});
