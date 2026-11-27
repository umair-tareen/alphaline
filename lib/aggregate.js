import { etOffsetSec } from './time.js';
// Buckets are counted in New York time and start on the 9:30 open (1h: 9:30, 10:30, ...; 4h: 9:30, 13:30, ...).
export function aggregate(bars, seconds) {
  const out = [];
  const shift = seconds < 86400 ? 34200 % seconds : 0;
  for (const b of bars) {
    const off = etOffsetSec(b.time);
    const t = Math.floor((b.time + off - shift) / seconds) * seconds - off + shift;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low);
      last.close = b.close; last.volume += b.volume;
    } else out.push({ ...b, time: t });
  }
  return out;
}
