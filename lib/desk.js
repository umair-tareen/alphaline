// Shared actions used by the web server, the MCP server and the morning brief.
import path from 'node:path';
import fs from 'node:fs';
import { DATA, ROOT, readJsonFile, writeJsonFile, loadSecrets, loadConfig } from './config.js';
import { getBars } from './bars.js';
import { earlyPremarket } from './providers/alpaca.js';
import { computeLevels } from './levels.js';
import { replaceSource } from './store.js';
import { todayET, etParts } from './time.js';

export async function levelsFor(symbol) {
  const [intra, daily, m15] = await Promise.all([getBars(symbol, '5m'), getBars(symbol, '1d'), getBars(symbol, '15m')]);
  const last = intra.bars.at(-1);
  // The 4:00 AM tape from Alpaca only tops up live broker feeds whose pre-market starts later (Schwab: 07:00) or that
  // miss off-exchange prints (Alpaca's free IEX feed). Demo and CSV charts keep their own data.
  const provider = intra.provider || loadConfig().provider;
  let early = [], earlyError = null;
  if (last && (provider === 'schwab' || provider === 'alpaca')) {
    try { early = await earlyPremarket(intra.symbol, etParts(last.time).date, loadSecrets()); }
    catch (e) { earlyError = e.message; }
  }
  const L = computeLevels(intra.symbol, intra.bars, daily.bars, m15.bars, early);
  if (earlyError) (L.warnings ||= []).push(`The 4:00 AM pre-market feed failed (${earlyError}), so pre-market levels start at ${L.premarket?.from || 'the chart feed\'s first bar'} and may miss the early high or low.`);
  return L;
}

export function levelsToDrawings(L) {
  const items = [];
  const lvl = (price, label, kind) => price != null && items.push({ type: 'level', price, label, kind });
  if (L.prior) { lvl(L.prior.high, 'Prev high', 'prior-high'); lvl(L.prior.low, 'Prev low', 'prior-low'); lvl(L.prior.close, 'Prev close', 'prior-close'); }
  if (L.premarket) { lvl(L.premarket.high, 'Pre-market high', 'premarket-high'); lvl(L.premarket.low, 'Pre-market low', 'premarket-low'); }
  if (L.gap && !L.gap.filled) items.push({
    type: 'zone', top: Math.max(L.gap.from, L.gap.to), bottom: Math.min(L.gap.from, L.gap.to), from: L.gap.time,
    label: L.gap.direction === 'up' ? 'Gap up' : 'Gap down', kind: 'gap',
  });
  const near = (a, b) => Math.abs((a.top + a.bottom) / 2 - L.last) - Math.abs((b.top + b.bottom) / 2 - L.last);
  for (const f of [...L.fvgs].sort(near).slice(0, 2)) items.push({ type: 'zone', top: f.top, bottom: f.bottom, from: f.from, label: 'Fast-move gap', kind: f.dir === 'bull' ? 'fvg-bull' : 'fvg-bear' });
  const sup = L.zones.filter(z => z.kind === 'support').sort(near).slice(0, 1), res = L.zones.filter(z => z.kind === 'resistance').sort(near).slice(0, 1);
  for (const z of [...sup, ...res]) items.push({ type: 'zone', top: z.top, bottom: z.bottom, from: z.from, label: z.kind === 'support' ? 'Support area' : 'Resistance area', touches: z.touches, kind: z.kind });
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
