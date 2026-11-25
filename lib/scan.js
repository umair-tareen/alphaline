// The scanner: plain numbers for every symbol on your scan list. Your AI applies your rules to them and ranks a top 5.
import { getBars } from './bars.js';
import { ema, sma } from './indicators.js';
import { atr } from './levels.js';
import { loadConfig } from './config.js';

const r2 = v => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

export async function scanSymbol(symbol) {
  const { bars, stale } = await getBars(symbol, '1d');
  if (bars.length < 60) throw new Error('not enough daily history');
  const last = bars[bars.length - 1], prev = bars[bars.length - 2];
  const e = n => ema(bars, n).at(-1)?.value;
  const e9 = e(9), e21 = e(21), e50 = e(50), a = atr(bars);
  const volAvg = sma(bars.slice(0, -1), 20, 'volume').at(-1)?.value;
  const e9prev = ema(bars.slice(0, -1), 9).at(-1)?.value, e21prev = ema(bars.slice(0, -1), 21).at(-1)?.value;
  return {
    symbol: symbol.toUpperCase(), date: new Date(last.time * 1000).toISOString().slice(0, 10), stale,
    close: r2(last.close), changePct: r2(((last.close - prev.close) / prev.close) * 100),
    ema9: r2(e9), ema21: r2(e21), ema50: r2(e50),
    above50: last.close > e50, ema9Above21: e9 > e21,
    crossUpToday: e9prev <= e21prev && e9 > e21, crossDownToday: e9prev >= e21prev && e9 < e21,
    volumeVsAvg: volAvg ? r2(last.volume / volAvg) : null,
    atr14: r2(a), stretchFrom21InAtr: a ? r2((last.close - e21) / a) : null,
    gapPct: r2(((last.open - prev.close) / prev.close) * 100),
    prevHigh: r2(prev.high), prevLow: r2(prev.low), aboveYesterdaysHigh: last.close > prev.high,
  };
}

export async function scanList(symbols) {
  const list = (symbols && symbols.length ? symbols : loadConfig().scanList || loadConfig().watchlist).map(s => s.toUpperCase());
  const rows = [], errors = [];
  for (let i = 0; i < list.length; i += 4) {
    const chunk = await Promise.all(list.slice(i, i + 4).map(s => scanSymbol(s).catch(e => { errors.push(s + ': ' + e.message); return null; })));
    rows.push(...chunk.filter(Boolean));
  }
  return { scanned: list.length, rows, errors, note: 'Numbers from daily candles, calculated by code. Apply the trader\'s rules from my-rules.md to rank them; never invent values.' };
}
