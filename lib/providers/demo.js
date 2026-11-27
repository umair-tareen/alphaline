// Zero-setup delayed data so the desk works on day one.
import { clipBadPrints } from '../levels.js';
// It reads Yahoo's public chart endpoint, which is unofficial: fine for learning on your own machine,
// may change without notice, and is not for redistribution. Switch to alpaca or schwab for real use.
const RANGE = { '5m': ['5m', '5d'], '15m': ['15m', '1mo'], '1h': ['60m', '3mo'], '1d': ['1d', '1y'] };

export const label = 'Demo feed (delayed, unofficial)';

export async function getBars(symbol, tf) {
  const [interval, range] = RANGE[tf];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=${tf === '1d' ? 'false' : 'true'}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (alphaline)' } });
  if (!r.ok) throw new Error(`Demo feed answered ${r.status} for ${symbol}`);
  const j = await r.json();
  const res = j.chart?.result?.[0];
  if (!res || !res.timestamp) throw new Error(j.chart?.error?.description || `No data for ${symbol}`);
  const q = res.indicators.quote[0];
  const out = [];
  res.timestamp.forEach((t, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some(v => v == null)) return;
    out.push({ time: t, open: o, high: h, low: l, close: c, volume: q.volume?.[i] || 0 });
  });
  return tf === '1d' ? out : clipYahoo(out);
}

// The free feed sometimes carries stray off-exchange prints as giant wicks. Trim wicks far outside the normal range.
function clipYahoo(bars) {
  const ranges = bars.map(b => b.high - b.low).sort((a, b) => a - b);
  return clipBadPrints(bars, (ranges[Math.floor(ranges.length / 2)] || 0) * 8);
}
