// MCP server: lets your own Claude or Codex read the chart and draw on it. Read-only toward your broker:
// there are no order tools here, on purpose.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ensureDirs, loadConfig } from './lib/config.js';
import { getBars, providerInfo, listProviders } from './lib/bars.js';
import { addDrawing, listDrawings, removeDrawing, clearDrawings } from './lib/store.js';
import { autoMark, levelsFor, setFocus, readBrief, saveBrief, readRules } from './lib/desk.js';
import { getNews } from './lib/news.js';
import { fmtET, parseTime } from './lib/time.js';
import { loadIndicators, saveIndicators, CUSTOM_DIR } from './lib/indicators.js';
import { scanList } from './lib/scan.js';
import { listAlerts, addAlert, removeAlert } from './lib/alerts.js';
import { readJournal, addTrade, sizePosition } from './lib/journal.js';

ensureDirs();
const server = new McpServer({ name: 'alphaline', version: '0.1.0' });
const text = v => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const wrap = fn => async args => { try { return text(await fn(args)); } catch (e) { return { ...text('Error: ' + e.message), isError: true }; } };
const Sym = z.string().describe('Ticker, e.g. SPY');
const TF = z.enum(['5m', '15m', '1h', '4h', '1d']);
const Color = z.string().optional().describe('Optional CSS colour; leave empty to use the colour for the kind');
const Suggest = z.boolean().default(false).describe('true = show as a suggestion the trader can Keep or dismiss on the desk');
const sug = s => (s ? { status: 'suggested' } : {});

server.tool('chart_get_bars', 'Recent candles for a symbol (times in New York time). Use it to read price action before marking.',
  { symbol: Sym, timeframe: TF.default('5m'), limit: z.number().int().min(10).max(500).default(120) },
  wrap(async ({ symbol, timeframe, limit }) => {
    const r = await getBars(symbol, timeframe);
    const rows = r.bars.slice(-limit).map(b => `${fmtET(b.time)} | ${b.open.toFixed(2)} ${b.high.toFixed(2)} ${b.low.toFixed(2)} ${b.close.toFixed(2)} | ${b.volume}`);
    return `${r.symbol} ${timeframe} from ${providerInfo().label}${r.stale ? ' (STALE copy: ' + r.error + ')' : ''}\ntime ET | open high low close | volume\n` + rows.join('\n');
  }));

server.tool('chart_levels', 'Calculated facts: prior day high/low/close, premarket high/low, open, opening gap, VWAP, ATR, unfilled 15m fair value gaps and daily support/resistance zones. Calculated by code, not guessed. Pass on any "warnings" and "clipped" (prints left out as bad) to the trader.',
  { symbol: Sym }, wrap(({ symbol }) => levelsFor(symbol)));

server.tool('chart_auto_mark', 'Draw the calculated levels, gaps and zones on the chart (replaces earlier auto marks, keeps yours).',
  { symbol: Sym }, wrap(async ({ symbol }) => { const r = await autoMark(symbol); return `Marked ${r.added} items on ${r.levels.symbol}.`; }));

server.tool('chart_draw_level', 'Draw a horizontal price level.',
  { symbol: Sym, price: z.number(), label: z.string().max(40), kind: z.enum(['support', 'resistance', 'target', 'invalidation', 'custom']).default('custom'), note: z.string().optional(), color: Color, suggest: Suggest },
  wrap(({ symbol, suggest, ...d }) => addDrawing(symbol, { type: 'level', ...d, ...sug(suggest) })));

server.tool('chart_draw_zone', 'Draw a price zone (a shaded box from a start time to the right edge).',
  { symbol: Sym, top: z.number(), bottom: z.number(), label: z.string().max(40),
    kind: z.enum(['support', 'resistance', 'gap', 'fvg-bull', 'fvg-bear', 'custom']).default('custom'),
    from: z.union([z.string(), z.number()]).optional().describe('Start time: "YYYY-MM-DD HH:MM" New York time, ISO, or unix seconds. Default: start of the chart'),
    note: z.string().optional(), color: Color, suggest: Suggest },
  wrap(({ symbol, top, bottom, from, suggest, ...d }) => addDrawing(symbol, { type: 'zone', top: Math.max(top, bottom), bottom: Math.min(top, bottom), from: parseTime(from), ...d, ...sug(suggest) })));

server.tool('chart_add_note', 'Pin a short note to a candle.',
  { symbol: Sym, text: z.string().max(60), time: z.union([z.string(), z.number()]).optional().describe('Candle time, New York time. Default: latest candle'), position: z.enum(['above', 'below']).default('above') },
  wrap(async ({ symbol, text: t, time, position }) => {
    const sec = parseTime(time) ?? (await getBars(symbol, '5m')).bars.at(-1).time;
    return addDrawing(symbol, { type: 'note', time: sec, label: t, position });
  }));

server.tool('chart_list_drawings', 'List what is drawn on a symbol, with ids.', { symbol: Sym }, wrap(({ symbol }) => listDrawings(symbol)));
server.tool('chart_remove_drawing', 'Remove one drawing by id.', { symbol: Sym, id: z.string() }, wrap(({ symbol, id }) => ({ removed: removeDrawing(symbol, id) })));
server.tool('chart_clear', 'Clear drawings. source "ai" = yours (default), "auto" = calculated marks, "all" = everything.',
  { symbol: Sym, source: z.enum(['ai', 'auto', 'all']).default('ai') }, wrap(({ symbol, source }) => ({ removed: clearDrawings(symbol, source) })));
server.tool('chart_focus', 'Switch the open chart to a symbol and timeframe.', { symbol: Sym, timeframe: TF.default('5m') }, wrap(({ symbol, timeframe }) => setFocus(symbol, timeframe)));

server.tool('indicator_list', 'Indicators on the chart (indicators.json) and the custom indicator files available in indicators/.', {},
  wrap(async () => {
    const fs = await import('node:fs');
    const files = fs.existsSync(CUSTOM_DIR) ? fs.readdirSync(CUSTOM_DIR).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)) : [];
    return { indicators: loadIndicators(), customFiles: files };
  }));

server.tool('indicator_set', 'Add or change an indicator (the chart updates live). Built-in types: ema, sma (length), vwap, bbands (length, mult), volume (avgLength, highlightAbove, highlightColor), profile (rows, valueArea). For anything else use indicator_write; the trader turns custom code on.',
  { id: z.string().regex(/^[a-zA-Z0-9_-]+$/).describe('e.g. ema50'), type: z.enum(['ema', 'sma', 'vwap', 'bbands', 'volume', 'profile', 'custom']).optional(),
    rows: z.number().int().min(8).max(80).optional(), valueArea: z.number().min(0.5).max(0.95).optional(),
    length: z.number().int().min(1).max(500).optional(), mult: z.number().optional(), color: z.string().optional(), width: z.number().int().min(1).max(4).optional(),
    enabled: z.boolean().optional(), pane: z.enum(['price', 'lower']).optional(), label: z.string().optional(), file: z.string().optional(), params: z.record(z.any()).optional(),
    avgLength: z.number().int().optional(), highlightAbove: z.boolean().optional(), highlightColor: z.string().optional() },
  wrap(({ id, ...patch }) => {
    const list = loadIndicators();
    const i = list.findIndex(x => x.id === id);
    if (i < 0 && !patch.type) throw new Error('New indicator needs a type');
    const next = i < 0 ? { id, enabled: true, ...patch } : { ...list[i], ...patch };
    // Custom indicator code runs inside the desk server, so only the trader switches new or changed code on.
    const prev = list[i], file = x => x && (x.file || x.id);
    if (next.type === 'custom' && next.enabled !== false && !(prev?.type === 'custom' && prev.enabled !== false && file(prev) === file(next)))
      throw new Error(`Custom indicator code runs on this computer, so the trader turns it on in the Indicators sheet after reading indicators/${file(next)}.js.`);
    if (i < 0) list.push(next); else list[i] = next;
    saveIndicators(list);
    return next;
  }));

server.tool('indicator_remove', 'Remove an indicator from the chart (use indicator_set enabled:false to just hide it).', { id: z.string() },
  wrap(({ id }) => { const list = loadIndicators(); const left = list.filter(x => x.id !== id); saveIndicators(left); return { removed: list.length - left.length }; }));

server.tool('data_sources', 'Data sources available (built-in, CSV imports and plug-ins in providers/), which one is active, and which need setup.', {},
  wrap(async () => ({ active: providerInfo(), sources: await listProviders() })));

server.tool('scan_watchlist', 'Scanner: daily numbers for every symbol on the scan list (close, 9/21/50 EMA, crosses, volume vs average, ATR, stretch from the 21 EMA, gap, yesterday\'s high/low). Apply the trader\'s rules to rank them.',
  { symbols: z.array(z.string()).optional().describe('Default: scanList in config.json') }, wrap(({ symbols }) => scanList(symbols)));

server.tool('journal_get', 'Read the trade journal as CSV. "mine" = the trader\'s journal (data/journal.csv), "sample" = the fictional practice week.',
  { which: z.enum(['mine', 'sample']).default('mine') }, wrap(({ which }) => readJournal(which)));

server.tool('journal_add', 'Add one trade to the journal.',
  { date: z.string(), symbol: z.string(), side: z.enum(['long', 'short']), entry: z.number(), exit: z.number().optional(), shares: z.number().optional(), stop: z.number().optional(),
    result_r: z.number().optional(), setup: z.string().optional(), rule_followed: z.enum(['yes', 'no']).optional(), emotion: z.string().optional(), notes: z.string().optional() },
  wrap(t => 'Added: ' + addTrade(t)));

server.tool('risk_size', 'Position size from the risk rule, calculated by code. Defaults come from config.json (account size, risk %). Never more shares than the account can buy; the result says which side it assumed.',
  { entry: z.number().positive(), stop: z.number().positive(), side: z.enum(['long', 'short']).optional().describe('long needs the stop below entry, short above; inferred from the stop when left out'), account: z.number().positive().optional(), riskPct: z.number().min(0.05).max(5).optional() },
  wrap(({ entry, stop, side, account, riskPct }) => { const a = loadConfig().account || {}; return sizePosition({ entry, stop, side, account: account ?? a.size ?? 10000, riskPct: riskPct ?? a.riskPct ?? 1 }); }));

server.tool('alert_set', 'Set a price alert. The chart page plays a sound and shows a notification when price crosses it.',
  { symbol: Sym, price: z.number(), direction: z.enum(['above', 'below']), note: z.string().max(80).optional() }, wrap(a => addAlert(a)));
server.tool('alert_list', 'List price alerts, including ones already triggered.', {}, wrap(() => listAlerts()));
server.tool('alert_remove', 'Remove a price alert by id.', { id: z.string() }, wrap(({ id }) => ({ removed: removeAlert(id) })));

server.tool('rules_save', 'Save the trader\'s rules to my-rules.md (replaces the file; a backup is kept). Only after the trader has approved the wording.',
  { markdown: z.string().min(20) }, wrap(async ({ markdown }) => {
    const fs = await import('node:fs'); const path = await import('node:path'); const { ROOT } = await import('./lib/config.js');
    const f = path.join(ROOT, 'my-rules.md'); if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');
    fs.writeFileSync(f, markdown); return 'Saved my-rules.md (previous version in my-rules.md.bak).';
  }));

server.tool('indicator_write', 'Save a custom indicator file (indicators/<name>.js). It is saved OFF: the code runs on the trader\'s computer with no sandbox, so the trader reads it and turns it on in the Indicators sheet. Code must follow indicators/rsi.js: export default { label, pane, compute(bars) } returning [{ time, value }]. Plain arithmetic on candles only: no imports, network or file access.',
  { name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/), code: z.string().min(20).max(20000), pane: z.enum(['price', 'lower']).default('lower'), color: z.string().optional() },
  wrap(async ({ name, code, pane, color }) => {
    // A basic check only, not a sandbox: the trader reading the file before turning it on is the real protection.
    if (/\b(import|require|process|fetch|child_process|fs|eval|Function|globalThis|constructor)\b/.test(code.replace(/export default/g, ''))) throw new Error('Indicators may only do arithmetic on the candles: no import, require, process, fetch, eval, Function, globalThis, constructor or file access.');
    const fs = await import('node:fs'); const path = await import('node:path');
    // Switch the entry off before the new code lands, so an indicator that was already on never runs unread code.
    const list = loadIndicators(); const item = { id: name, type: 'custom', file: name, pane, color: color || '#a78bfa', width: 1, enabled: false };
    const i = list.findIndex(x => x.id === name); if (i < 0) list.push(item); else list[i] = { ...list[i], ...item };
    for (const x of list) if (x.type === 'custom' && x.file === name) x.enabled = false;
    saveIndicators(list);
    fs.mkdirSync(CUSTOM_DIR, { recursive: true }); fs.writeFileSync(path.join(CUSTOM_DIR, name + '.js'), code);
    return 'Saved indicators/' + name + '.js. It is off until the trader reads the file and turns it on in the Indicators sheet (the code runs on their computer).';
  }));

server.tool('scanlist_set', 'Replace the scanner\'s symbol list (config.json scanList).', { symbols: z.array(z.string()).min(1).max(60) },
  wrap(async ({ symbols }) => {
    const path = await import('node:path'); const { ROOT, writeJsonFile } = await import('./lib/config.js');
    const cfg = loadConfig(); cfg.scanList = symbols.map(s => s.toUpperCase()); writeJsonFile(path.join(ROOT, 'config.json'), cfg);
    return 'Scan list is now: ' + cfg.scanList.join(', ');
  }));

server.tool('news_get', 'Recent market headlines and this week\'s US economic calendar (high/medium impact).',
  { symbols: z.array(z.string()).optional().describe('Also pull headlines for these tickers. Default: the watchlist') },
  wrap(({ symbols }) => getNews(symbols || loadConfig().watchlist)));

server.tool('brief_get', 'Read today\'s brief (or the latest one).', {}, wrap(() => readBrief() || 'No brief yet. Run: npm run brief'));
server.tool('brief_save', 'Save today\'s morning brief (Markdown). It shows in the desk sidebar.',
  { markdown: z.string().min(20) }, wrap(({ markdown }) => 'Saved to ' + saveBrief(markdown)));
server.tool('rules_get', 'Read the trader\'s own rules (my-rules.md). Always read these before marking a chart or writing a brief.',
  {}, wrap(() => readRules() || 'my-rules.md is empty.'));

await server.connect(new StdioServerTransport());
