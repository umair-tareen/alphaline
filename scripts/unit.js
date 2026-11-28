// Checks for the calculation fixes (no network, no server). Run: npm run test:unit
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { session, parseTime } from '../lib/time.js';
import { aggregate } from '../lib/aggregate.js';
import { clipBadPrints, computeLevels } from '../lib/levels.js';
import { sizePosition, splitCsvLine } from '../lib/journal.js';
import { vwap } from '../lib/indicators.js';
import { getBars as csvBars } from '../lib/providers/csv.js';
import { ROOT } from '../lib/config.js';

const et = s => parseTime(s); // "YYYY-MM-DD HH:MM" in New York time -> unix seconds
const bar = (t, o, h, l, c, v = 100) => ({ time: et(t), open: o, high: h, low: l, close: c, volume: v });

// Half day: 13:00 closes the regular session on 2026-11-27, not on a normal day.
assert.equal(session(et('2026-11-27 12:55')), 'rth');
assert.equal(session(et('2026-11-27 13:00')), 'post');
assert.equal(session(et('2026-11-25 13:00')), 'rth');

// 1h and 4h candles start on the 9:30 open, in summer and winter time.
for (const day of ['2026-07-15', '2026-11-25']) {
  const h = aggregate([bar(`${day} 09:00`, 1, 1, 1, 1), bar(`${day} 09:30`, 2, 2, 2, 2), bar(`${day} 10:00`, 3, 3, 3, 3)], 3600);
  assert.deepEqual(h.map(b => b.time), [et(`${day} 08:30`), et(`${day} 09:30`)], 'premarket stays out of the 9:30 hour');
  const f = aggregate([bar(`${day} 09:30`, 1, 1, 1, 1), bar(`${day} 13:00`, 2, 2, 2, 2), bar(`${day} 13:30`, 3, 3, 3, 3)], 14400);
  assert.deepEqual(f.map(b => b.time), [et(`${day} 09:30`), et(`${day} 13:30`)]);
}
assert.deepEqual(aggregate([bar('2026-11-25 09:30', 1, 1, 1, 1), bar('2026-11-25 15:55', 1, 1, 1, 1)], 86400).length, 1, 'daily buckets by date');

// Bad print (SPY 2026-11-27 14:05: an average-price trade at 694.23 inside a ~728 market) is trimmed; a normal bar is not.
const spy = [bar('2026-11-27 14:00', 728.2, 728.4, 728.1, 728.28), bar('2026-11-27 14:05', 699.48, 728.5, 694.23, 728.35), bar('2026-11-27 14:10', 728.4, 729, 728.3, 729)];
const clean = clipBadPrints(spy, 17.11 * 0.5);
assert.equal(clean[1].low, 728.28); assert.equal(clean[1].open, 728.28); assert.deepEqual(clean[0], spy[0]);
const realMove = [bar('2026-11-27 09:25', 100, 100.2, 99.9, 100), bar('2026-11-27 09:30', 100, 104, 99.8, 103.5), bar('2026-11-27 09:35', 103.4, 103.8, 103, 103.2)];
assert.deepEqual(clipBadPrints(realMove, 2.5), realMove, 'a move that holds is kept');

// Levels: a bad print after the half-day close no longer "fills" the gap, and ATR ignores today's unfinished bar.
const daily = Array.from({ length: 20 }, (_, i) => ({ time: et('2026-10-29') + i * 86400, open: 100, high: 104, low: 96, close: 100, volume: 1 }));
daily.push({ time: et('2026-11-27'), open: 103, high: 103.2, low: 103, close: 103.1, volume: 1 }); // today, partial
const intra = [bar('2026-11-25 15:50', 100, 100.1, 99.9, 100), bar('2026-11-25 15:55', 100, 100.1, 99.9, 100),
  bar('2026-11-27 09:30', 103, 103.5, 102.8, 103.2), bar('2026-11-27 12:55', 103.2, 103.4, 103, 103.1),
  bar('2026-11-27 14:05', 103.1, 103.2, 90, 103.1), bar('2026-11-27 14:10', 103.1, 103.2, 103, 103.1)];
const L = computeLevels('TEST', intra, daily, []);
assert.equal(L.atr, 8, 'ATR from finished days only');
assert.equal(L.today.low, 102.8); assert.equal(L.gap.filled, false);

// 4 AM pre-market from a second feed counts toward the pre-market high, and its one-bar bad print does not.
const early = [bar('2026-11-27 04:01', 251.9, 252.75, 250.6, 251), bar('2026-11-27 08:04', 250.9, 250.95, 250.85, 250.9),
  bar('2026-11-27 08:05', 250.9, 250.98, 243.82, 243.82), bar('2026-11-27 08:06', 250.8, 250.9, 250.7, 250.8)];
const L2 = computeLevels('TEST', [bar('2026-11-25 15:55', 244, 244.4, 244, 244.37), bar('2026-11-27 07:00', 250, 251.33, 249.9, 251),
  bar('2026-11-27 09:30', 250.45, 251, 250, 250.9), bar('2026-11-27 09:35', 250.9, 251.2, 250.8, 251.1)], daily, [], early);
assert.equal(L2.premarket.high, 252.75); assert.equal(L2.premarket.from, '04:01'); assert.equal(L2.premarket.low, 249.9);

// Position size checks the stop side when the side is given.
assert.throws(() => sizePosition({ account: 10000, riskPct: 1, entry: 100, stop: 110, side: 'long' }), /below/);
assert.equal(sizePosition({ account: 10000, riskPct: 1, entry: 100, stop: 98, side: 'long' }).shares, 50);

// Position size never exceeds what the account can buy, refuses nonsense, and says which side it assumed.
const capped = sizePosition({ account: 10000, riskPct: 1, entry: 100, stop: 99.9 });
assert.equal(capped.shares, 100); assert.equal(capped.positionValue, 10000); assert.match(capped.note, /Capped/);
assert.throws(() => sizePosition({ account: -10000, riskPct: 1, entry: 100, stop: 99 }), /account/);
assert.throws(() => sizePosition({ account: 10000, riskPct: 1, entry: 0, stop: 1 }), /entry/);
const inferred = sizePosition({ account: 10000, riskPct: 1, entry: 100, stop: 105 });
assert.equal(inferred.side, 'short'); assert.equal(inferred.sideInferred, true);

// A trimmed print is reported, not hidden.
const L3 = computeLevels('TEST', [...intra.slice(0, 4), bar('2026-11-27 12:50', 103.1, 103.2, 103, 103.1), bar('2026-11-27 12:55', 103.1, 120, 103, 103.1), bar('2026-11-27 13:00', 103.1, 103.2, 103, 103.1)], daily, []);
assert.equal(L3.today.high, 103.5); assert.equal(L3.clipped.items[0].field, 'high'); assert.equal(L3.clipped.items[0].from, 120);

// Prior close comes from the daily bar (the official close) when it is close to the last regular-session bar.
const daily2 = [...daily.slice(0, -1), { time: et('2026-11-25'), open: 100, high: 101, low: 99, close: 100.4, volume: 1 }, daily.at(-1)];
const L4 = computeLevels('TEST', intra, daily2, []);
assert.equal(L4.prior.close, 100.4); assert.match(L4.prior.closeFrom, /daily/);

// Chart VWAP is regular-session only, like chart_levels.
const vw = vwap([bar('2026-11-25 08:00', 50, 50, 50, 50, 1000), bar('2026-11-25 09:30', 100, 100, 100, 100, 10), bar('2026-11-25 09:35', 102, 102, 102, 102, 10), bar('2026-11-25 16:05', 1, 1, 1, 1, 1000)]);
assert.deepEqual(vw.map(p => p.value), [100, 101]);

// Journal keeps quotes in notes.
assert.deepEqual(splitCsvLine('a,"he said ""hi""",b'), ['a', 'he said "hi"', 'b']);

// CSV import: exact column names win over prefixes, and times without a zone are New York time.
const dir = path.join(ROOT, 'data', 'import'), f = path.join(dir, 'ZZUNIT_5m.csv');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(f, 'date,open,high,low,change,close,volume\n2026-01-15 09:30:00,10,11,9,-0.5,10.5,100\n2026-01-15 09:35:00,10.5,11,10,0.1,10.6,100\n');
try {
  const b = await csvBars('ZZUNIT', '5m');
  assert.equal(b[0].close, 10.5); assert.equal(b[0].time, et('2026-01-15 09:30'));
  // A coarser file is not passed off as finer candles, and daily candles leave out pre-market and after-hours.
  fs.writeFileSync(f, 'date,open,high,low,close,volume\n2026-01-15 08:00:00,10,30,9,10,100\n2026-01-15 09:30:00,10,11,9,10.5,100\n2026-01-15 09:35:00,10.5,12,10,10.6,100\n2026-01-15 17:00:00,10.6,10.6,1,10.6,100\n');
  const d1 = await csvBars('ZZUNIT', '1d');
  assert.equal(d1.length, 1); assert.equal(d1[0].high, 12); assert.equal(d1[0].low, 9); assert.equal(d1[0].close, 10.6);
} finally { fs.unlinkSync(f); }
const g = path.join(dir, 'ZZUNIT_1h.csv');
fs.writeFileSync(g, 'date,open,high,low,close,volume\n2026-01-15 09:30:00,10,11,9,10.5,100\n2026-01-15 10:30:00,10.5,11,10,10.6,100\n');
try { await assert.rejects(() => csvBars('ZZUNIT', '5m'), /cannot show 5m/); } finally { fs.unlinkSync(g); }

console.log('unit checks passed');
