// Plug-and-play files: drop a CSV into data/import/ and chart it. No account needed.
// Name files SYMBOL.csv or SYMBOL_5m.csv (also _1m, _15m, _1h, _1d). The finest file is rolled up to any larger candle size.
// Columns are found by name: time/date/datetime/timestamp, open, high, low, close, volume. Exports from
// thinkorswim, Webull, TradingView, NinjaTrader and most brokers work once saved as CSV.
import fs from 'node:fs';
import path from 'node:path';
import { DATA } from '../config.js';
import { aggregate } from '../aggregate.js';

export const label = 'Your CSV files';
const DIR = path.join(DATA, 'import');
const SEC = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400 };

function parseTime(v) {
  const s = String(v).trim().replace(/^"|"$/g, '');
  if (/^\d{9,10}$/.test(s)) return +s;
  if (/^\d{12,13}$/.test(s)) return Math.floor(+s / 1000);
  const t = Date.parse(s.includes('T') || /[+-]\d{2}:?\d{2}$|Z$/.test(s) ? s : s.replace(' ', 'T'));
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const head = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const col = (...names) => head.findIndex(h => names.some(n => h === n || h.startsWith(n)));
  const c = { t: col('time', 'date', 'datetime', 'timestamp'), o: col('open', 'o'), h: col('high', 'h'), l: col('low', 'l'), cl: col('close', 'last', 'c'), v: col('volume', 'vol', 'v') };
  const d = col('date'), tm = head.findIndex(h => h === 'time');
  if ([c.t, c.o, c.h, c.l, c.cl].some(i => i < 0)) throw new Error(`${path.basename(file)}: need columns time (or date), open, high, low, close`);
  const out = [];
  for (const line of lines.slice(1)) {
    const f = line.split(sep);
    const raw = d >= 0 && tm >= 0 && d !== tm ? `${f[d]} ${f[tm]}` : f[c.t];
    const time = parseTime(raw);
    const n = i => parseFloat(String(f[i]).replace(/[",$]/g, ''));
    if (time == null || [c.o, c.h, c.l, c.cl].some(i => Number.isNaN(n(i)))) continue;
    out.push({ time, open: n(c.o), high: n(c.h), low: n(c.l), close: n(c.cl), volume: c.v >= 0 ? n(c.v) || 0 : 0 });
  }
  return out.sort((a, b) => a.time - b.time);
}

export function listImports() {
  return fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => /\.csv$/i.test(f)) : [];
}

export async function getBars(symbol, tf) {
  const files = listImports().map(f => {
    const m = /^([A-Za-z0-9.^=-]+?)(?:_(1m|5m|15m|1h|1d))?\.csv$/i.exec(f);
    return m && m[1].toUpperCase() === symbol ? { f, sec: SEC[(m[2] || '').toLowerCase()] || 0 } : null;
  }).filter(Boolean);
  if (!files.length) throw new Error(`No file for ${symbol} in data/import. Add ${symbol}.csv or ${symbol}_5m.csv`);
  const want = SEC[tf];
  const usable = files.filter(x => !x.sec || x.sec <= want).sort((a, b) => b.sec - a.sec);
  const pick = usable[0] || files[0];
  const bars = readCsv(path.join(DIR, pick.f));
  if (!bars.length) throw new Error(pick.f + ' has no readable rows');
  if (tf === '1d') {
    const byDay = new Map();
    for (const b of bars) {
      const key = new Date(b.time * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const cur = byDay.get(key);
      if (!cur) byDay.set(key, { ...b }); else { cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume; }
    }
    return [...byDay.values()];
  }
  return pick.sec === want ? bars : aggregate(bars, want);
}
