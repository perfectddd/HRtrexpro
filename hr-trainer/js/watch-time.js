// Watch clock: parse the Current Time characteristic (0x2A2B, read from service fee0
// on Amazfit T-Rex Pro) and keep the watch's time ticking locally via an offset.

export const CURRENT_TIME_CHAR = 0x2a2b;
export const WATCH_TIME_REFRESH_MS = 5 * 60 * 1000;

// Layout: year u16 LE, month, day, hour, minute, second, [day of week, fractions256,
// adjust reason, timezone int8 in quarter hours].
export function parseCurrentTime(bytes) {
  if (!bytes || bytes.length < 7) return null;
  const year = bytes[0] | (bytes[1] << 8);
  const [month, day, hour, minute, second] = [bytes[2], bytes[3], bytes[4], bytes[5], bytes[6]];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  return {
    year, month, day, hour, minute, second,
    dayOfWeek: bytes.length >= 8 ? bytes[7] : null,
    tzQuarterHours: bytes.length >= 11 ? (bytes[10] << 24) >> 24 : null,
  };
}

// Watch time minus PC time, in ms. The watch truncates to whole seconds, so assume it
// was mid-second (+500 ms); the PC moment is the midpoint of the read request.
export function watchOffsetMs(t, readStartMs, readEndMs) {
  const watchMs = new Date(t.year, t.month - 1, t.day, t.hour, t.minute, t.second).getTime() + 500;
  return Math.round(watchMs - (readStartMs + readEndMs) / 2);
}

export function formatClock(nowMs, offsetMs) {
  const d = new Date(nowMs + offsetMs);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function describeDrift(offsetMs) {
  if (Math.abs(offsetMs) < 2000) return null;
  const total = Math.round(Math.abs(offsetMs) / 1000);
  const min = Math.floor(total / 60), sec = total % 60;
  const amount = min ? `${min} นาที ${sec} วิ` : `${sec} วิ`;
  return `นาฬิกา${offsetMs < 0 ? 'ช้า' : 'เร็ว'} ${amount}`;
}
