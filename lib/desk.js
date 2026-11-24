// Shared actions used by the web server, the MCP server and the morning brief.
import path from 'node:path';
import fs from 'node:fs';
import { DATA, ROOT, readJsonFile, writeJsonFile } from './config.js';
import { getBars } from './bars.js';
import { computeLevels } from './levels.js';
import { replaceSource } from './store.js';
import { todayET } from './time.js';

export async function levelsFor(symbol) {
  const [intra, daily, m15] = await Promise.all([getBars(symbol, '5m'), getBars(symbol, '1d'), getBars(symbol, '15m')]);
  return computeLevels(intra.symbol, intra.bars, daily.bars, m15.bars);
}

export function levelsToDrawings(L) {
  const items = [];
  const lvl = (price, label, kind) => price != null && items.push({ type: 'level', price, label, kind });
  if (L.prior) { lvl(L.prior.high, 'PDH', 'prior-high'); lvl(L.prior.low, 'PDL', 'prior-low'); lvl(L.prior.close, 'PDC', 'prior-close'); }
  if (L.premarket) { lvl(L.premarket.high, 'PMH', 'premarket-high'); lvl(L.premarket.low, 'PML', 'premarket-low'); }
  if (L.vwap != null) lvl(L.vwap, 'VWAP', 'vwap');
  if (L.gap && !L.gap.filled) items.push({
    type: 'zone', top: Math.max(L.gap.from, L.gap.to), bottom: Math.min(L.gap.from, L.gap.to), from: L.gap.time,
    label: `Gap ${L.gap.direction} ${L.gap.size > 0 ? '+' : ''}${L.gap.size}`, kind: 'gap',
  });
  for (const f of L.fvgs) items.push({ type: 'zone', top: f.top, bottom: f.bottom, from: f.from, label: f.dir === 'bull' ? 'FVG ↑ (15m)' : 'FVG ↓ (15m)', kind: f.dir === 'bull' ? 'fvg-bull' : 'fvg-bear' });
  for (const z of L.zones) items.push({ type: 'zone', top: z.top, bottom: z.bottom, from: z.from, label: `${z.kind === 'support' ? 'Support' : 'Resistance'} · ${z.touches} touches`, kind: z.kind });
  return items;
}

export async function autoMark(symbol) {
  const L = await levelsFor(symbol);
  const added = replaceSource(L.symbol, 'auto', levelsToDrawings(L));
  return { levels: L, added: added.length };
}

const STATE = path.join(DATA, 'state.json');
export const getState = () => readJsonFile(STATE, { symbol: null, tf: null });
export function setFocus(symbol, tf) { const s = { symbol: symbol.toUpperCase(), tf, at: new Date().toISOString() }; writeJsonFile(STATE, s); return s; }

export function briefPath(date = todayET(), kind = 'ai') {
  return path.join(DATA, 'briefs', kind === 'ai' ? `${date}.md` : `${date}.facts.md`);
}
export function readBrief(date = todayET()) {
  for (const kind of ['ai', 'facts']) {
    const f = briefPath(date, kind);
    if (fs.existsSync(f)) return { date, kind, markdown: fs.readFileSync(f, 'utf8') };
  }
  const dir = path.join(DATA, 'briefs');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort() : [];
  if (!files.length) return null;
  const f = files[files.length - 1];
  return { date: f.slice(0, 10), kind: f.includes('.facts.') ? 'facts' : 'ai', markdown: fs.readFileSync(path.join(dir, f), 'utf8'), old: true };
}
export function saveBrief(markdown, date = todayET()) {
  const f = briefPath(date, 'ai');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, markdown);
  return f;
}
export function readRules() {
  const f = path.join(ROOT, 'my-rules.md');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
}
