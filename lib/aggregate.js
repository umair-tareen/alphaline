export function aggregate(bars, seconds) {
  const out = [];
  for (const b of bars) {
    const t = Math.floor(b.time / seconds) * seconds;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low);
      last.close = b.close; last.volume += b.volume;
    } else out.push({ ...b, time: t });
  }
  return out;
}
