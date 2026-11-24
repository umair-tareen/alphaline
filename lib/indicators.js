// Indicators: built-ins (ema, sma, vwap, bbands, volume) plus your own files in indicators/.
// Which ones show, and how, lives in indicators.json, which you or your AI can edit.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readJsonFile, writeJsonFile } from './config.js';
import { etParts } from './time.js';

export const CONFIG_FILE = path.join(ROOT, 'indicators.json');
export const CUSTOM_DIR = path.join(ROOT, 'indicators');
const r4 = v => Math.round(v * 10000) / 10000;

export const loadIndicators = () => readJsonFile(CONFIG_FILE, []);
export const saveIndicators = list => writeJsonFile(CONFIG_FILE, list);

export function ema(bars, n, key = 'close') {
  const out = [], k = 2 / (n + 1);
  let e = null, sum = 0;
  bars.forEach((b, i) => {
    if (i < n) { sum += b[key]; if (i === n - 1) { e = sum / n; out.push({ time: b.time, value: r4(e) }); } return; }
    e = b[key] * k + e * (1 - k);
    out.push({ time: b.time, value: r4(e) });
  });
  return out;
}

export function sma(bars, n, key = 'close') {
  const out = [];
  let sum = 0;
  bars.forEach((b, i) => {
    sum += b[key];
    if (i >= n) sum -= bars[i - n][key];
    if (i >= n - 1) out.push({ time: b.time, value: r4(sum / n) });
  });
  return out;
}

export function vwap(bars) {
  const out = [];
  let day = null, pv = 0, v = 0;
  for (const b of bars) {
    const d = etParts(b.time).date;
    if (d !== day) { day = d; pv = 0; v = 0; }
    pv += ((b.high + b.low + b.close) / 3) * b.volume; v += b.volume;
    if (v > 0) out.push({ time: b.time, value: r4(pv / v) });
  }
  return out;
}

export function bbands(bars, n, mult) {
  const mid = sma(bars, n), up = [], lo = [];
  mid.forEach((m, j) => {
    const i = j + n - 1;
    const sd = Math.sqrt(bars.slice(i - n + 1, i + 1).reduce((a, b) => a + (b.close - m.value) ** 2, 0) / n);
    up.push({ time: m.time, value: r4(m.value + mult * sd) });
    lo.push({ time: m.time, value: r4(m.value - mult * sd) });
  });
  return { mid, up, lo };
}

async function loadCustom(name) {
  const file = path.join(CUSTOM_DIR, name.replace(/[^a-zA-Z0-9_-]/g, '') + '.js');
  if (!fs.existsSync(file)) throw new Error('No custom indicator file indicators/' + name + '.js');
  const url = pathToFileURL(file).href + '?v=' + fs.statSync(file).mtimeMs;
  return (await import(url)).default;
}

export async function computeIndicators(bars) {
  const lines = [], errors = [];
  let volume = null;
  for (const c of loadIndicators().filter(c => c.enabled !== false)) {
    const base = { color: c.color || '#dfe9e4', width: c.width || 1, pane: c.pane || 'price' };
    try {
      if (c.type === 'ema' || c.type === 'sma') {
        lines.push({ ...base, key: c.id, label: c.label || `${c.length} ${c.type.toUpperCase()}`, points: (c.type === 'ema' ? ema : sma)(bars, c.length || 9) });
      } else if (c.type === 'vwap') {
        lines.push({ ...base, key: c.id, label: 'VWAP', points: vwap(bars) });
      } else if (c.type === 'bbands') {
        const b = bbands(bars, c.length || 20, c.mult || 2);
        lines.push({ ...base, key: c.id + ':up', label: `BB ${c.length || 20}`, points: b.up }, { ...base, key: c.id + ':mid', label: '', points: b.mid }, { ...base, key: c.id + ':lo', label: '', points: b.lo });
      } else if (c.type === 'volume') {
        volume = { ...c, avg: sma(bars, c.avgLength || 20, 'volume') };
      } else if (c.type === 'custom') {
        const mod = await loadCustom(c.file || c.id);
        const res = await mod.compute(bars, c.params || {});
        const pane = c.pane || mod.pane || 'price';
        const set = Array.isArray(res) ? [{ label: c.label || mod.label || c.id, points: res }] : res.lines;
        set.forEach((l, i) => lines.push({ ...base, pane, key: `${c.id}:${i}`, label: l.label ?? '', color: l.color || base.color, points: l.points.filter(p => Number.isFinite(p.value)), guides: i === 0 ? (c.guides || mod.guides || []) : [] }));
      } else throw new Error('Unknown indicator type ' + c.type);
    } catch (e) { errors.push(`${c.id}: ${e.message}`); }
  }
  return { lines, volume, errors };
}
