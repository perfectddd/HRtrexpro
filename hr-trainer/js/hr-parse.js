// Parse the BLE Heart Rate Measurement characteristic (0x2A37).
export function parseHeartRate(dataView) {
  const flags = dataView.getUint8(0);
  let offset = 1;
  let bpm;
  if (flags & 0x01) {
    bpm = dataView.getUint16(offset, true);
    offset += 2;
  } else {
    bpm = dataView.getUint8(offset);
    offset += 1;
  }
  if (flags & 0x08) offset += 2; // energy expended
  const rr = [];
  if (flags & 0x10) {
    while (offset + 1 < dataView.byteLength) {
      rr.push(Math.round((dataView.getUint16(offset, true) * 1000) / 1024));
      offset += 2;
    }
  }
  return { bpm, rr };
}

export function isValidBpm(bpm) {
  return Number.isFinite(bpm) && bpm >= 1 && bpm <= 230;
}
