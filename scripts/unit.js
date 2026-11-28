// Checks for the calculation fixes (no network, no server). Run: npm run test:unit
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { session, parseTime } from '../lib/time.js';
import { aggregate } from '../lib/aggregate.js';
import { clipBadPrints, computeLevels } from '../lib/levels.js';
import { sizePosition, splitCsvLine, cell } from '../lib/journal.js';
import { fileSafe } from '../lib/config.js';
import { addAlert } from '../lib/alerts.js';
import { fairValueGaps, atr } from '../lib/levels.js';
import rsi from '../indicators/rsi.js';
import { vwap } from '../lib/indicators.js';
import { getBars as csvBars } from '../lib/providers/csv.js';
import { ROOT, withLock } from '../lib/config.js';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

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

// 2026-11-28 review fixes.
assert.notEqual(fileSafe('BRK.B'), fileSafe('BRK-B')); assert.notEqual(fileSafe('BRK.B'), fileSafe('BRK_B')); assert.equal(fileSafe('spy'), 'SPY');
assert.equal(et('2026-11-27 10:30:15') - et('2026-11-27 10:30'), 15, 'seconds are New York time too');
assert.throws(() => addAlert({ symbol: 'SPY', price: '', direction: 'above' }), /above 0/);
assert.throws(() => addAlert({ symbol: 'SPY', price: 0, direction: 'above' }), /above 0/);
assert.equal(cell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`); assert.equal(cell('-1.5'), '-1.5'); assert.equal(cell('+1 day'), "'+1 day");
const flat = Array.from({ length: 30 }, (_, i) => ({ time: i, open: 5, high: 5, low: 5, close: 5, volume: 1 }));
assert.equal(rsi.compute(flat).at(-1).value, 50, 'flat RSI is 50');
const overnight = [bar('2026-11-24 19:45', 100, 100.2, 99.8, 100), bar('2026-11-25 04:00', 103, 103.5, 102.8, 103.2), bar('2026-11-25 04:15', 103.2, 104, 103, 103.8)];
assert.equal(fairValueGaps(overnight).length, 0, 'no fast-move gap across the overnight break');
const sameDay = [bar('2026-11-25 10:00', 100, 100.2, 99.8, 100), bar('2026-11-25 10:15', 100.2, 103, 100.1, 102.9), bar('2026-11-25 10:30', 103, 103.5, 102.8, 103.2)];
assert.equal(fairValueGaps(sameDay).length, 1);
const tr = Array.from({ length: 40 }, (_, i) => ({ time: i, open: 100, high: 100 + (i < 20 ? 1 : 3), low: 100 - (i < 20 ? 1 : 3), close: 100, volume: 1 }));
assert.ok(atr(tr) > 5 && atr(tr) < 6, 'Wilder ATR lags a jump in range (plain 14-day mean would read 6)');

// Save lock: the web server and the MCP server are separate processes, so concurrent read-modify-write saves must all land.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alphaline-lock-'));
  const counter = path.join(tmp, 'counter.json');
  const cfgUrl = pathToFileURL(path.join(ROOT, 'lib', 'config.js')).href;
  const child = `const { withLock } = await import(${JSON.stringify(cfgUrl)}); const fs = await import('node:fs'); const f = process.argv[1];
    for (let i = 0; i < 100; i++) withLock(f, () => { const n = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).n : 0; fs.writeFileSync(f, JSON.stringify({ n: n + 1 })); });`;
  const run = () => new Promise((ok, fail) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', child, counter], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', d => (err += d));
    p.on('error', fail); p.on('close', code => (code === 0 ? ok() : fail(new Error('lock child failed: ' + err))));
  });
  try {
    await Promise.all([run(), run(), run(), run()]);
    assert.equal(JSON.parse(fs.readFileSync(counter, 'utf8')).n, 400, '4 processes x 100 locked saves all land');
    assert.equal(fs.existsSync(counter + '.lock'), false, 'lock released');
    // A failed change releases the lock, and a lock left behind by a crash (older than 10 s) is cleared.
    assert.throws(() => withLock(counter, () => { throw new Error('boom'); }), /boom/);
    assert.equal(fs.existsSync(counter + '.lock'), false, 'lock released after an error');
    fs.writeFileSync(counter + '.lock', ''); const old = new Date(Date.now() - 60000); fs.utimesSync(counter + '.lock', old, old);
    assert.equal(withLock(counter, () => 'ran'), 'ran', 'stale lock cleared');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// Morning run: nobody watches it and it reads news headlines, so every way it starts gets the same read and draw tools.
{
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const mcp = read('mcp.js'), sh = read('scripts/morning.sh'), ps = read('scripts/morning.ps1');
  const registered = [...mcp.matchAll(/server\.tool\('([a-z_]+)'/g)].map(m => m[1]);
  const setSrc = mcp.match(/MORNING_TOOLS = new Set\(\[([^\]]+)\]\)/);
  assert.ok(setSrc, 'mcp.js defines MORNING_TOOLS');
  const morning = [...setSrc[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
  const claudeList = src => [...src.matchAll(/mcp__alphaline__([a-z_]+)/g)].map(m => m[1]).sort();
  assert.deepEqual(claudeList(sh), morning, 'morning.sh Claude list matches mcp.js --morning');
  assert.deepEqual(claudeList(ps), morning, 'morning.ps1 Claude list matches mcp.js --morning');
  for (const t of morning) assert.ok(registered.includes(t), `morning tool ${t} exists in mcp.js`);
  // Every other tool is left out on purpose. A new tool must be added to one list or the other here.
  const leftOut = ['chart_remove_drawing', 'chart_clear', 'indicator_set', 'indicator_remove', 'indicator_write', 'journal_get', 'journal_add',
    'risk_size', 'alert_set', 'alert_list', 'alert_remove', 'rules_save', 'scanlist_set'];
  assert.deepEqual(registered.filter(t => !morning.includes(t)).sort(), leftOut.sort(), 'every tool is either in the morning set or left out on purpose');
  for (const t of ['rules_save', 'scanlist_set', 'journal_add', 'alert_set', 'alert_remove', 'indicator_set', 'indicator_remove', 'indicator_write', 'chart_clear', 'chart_remove_drawing'])
    assert.ok(!morning.includes(t), `${t} is not in the morning set`);
  // The Codex branch starts mcp.js with --morning in both scripts.
  for (const [name, src] of [['morning.sh', sh], ['morning.ps1', ps]]) {
    const codex = src.split('\n').find(l => /^\s*codex exec /.test(l));
    assert.ok(codex, `${name} has a codex exec line`);
    assert.match(codex, /mcp_servers\.alphaline\.args=\['[^']*','--morning'\]/, `${name} Codex run uses --morning`);
    assert.match(codex, /mcp_servers\.alphaline\.command=/, `${name} Codex run sets the server command`);
  }
  assert.match(mcp, /process\.argv\.includes\('--morning'\)/, 'mcp.js honours --morning');
}

console.log('unit checks passed');
