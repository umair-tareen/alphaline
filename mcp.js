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

ensureDirs();
const server = new McpServer({ name: 'alphaline', version: '0.1.0' });
const text = v => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const wrap = fn => async args => { try { return text(await fn(args)); } catch (e) { return { ...text('Error: ' + e.message), isError: true }; } };
const Sym = z.string().describe('Ticker, e.g. SPY');
const TF = z.enum(['5m', '15m', '1h', '1d']);
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

server.tool('chart_levels', 'Calculated facts: prior day high/low/close, premarket high/low, open, opening gap, VWAP, ATR, unfilled 15m fair value gaps and daily support/resistance zones. Calculated by code, not guessed.',
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

server.tool('indicator_set', 'Add or change an indicator (the chart updates live). Built-in types: ema, sma (length), vwap, bbands (length, mult), volume (avgLength, highlightAbove, highlightColor). For anything else write indicators/<name>.js (see indicators/rsi.js) and use type "custom" with file "<name>".',
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
    if (i < 0) list.push(next); else list[i] = next;
    saveIndicators(list);
    return next;
  }));

server.tool('indicator_remove', 'Remove an indicator from the chart (use indicator_set enabled:false to just hide it).', { id: z.string() },
  wrap(({ id }) => { const list = loadIndicators(); const left = list.filter(x => x.id !== id); saveIndicators(left); return { removed: list.length - left.length }; }));

server.tool('data_sources', 'Data sources available (built-in, CSV imports and plug-ins in providers/), which one is active, and which need setup.', {},
  wrap(async () => ({ active: providerInfo(), sources: await listProviders() })));

server.tool('news_get', 'Recent market headlines and this week\'s US economic calendar (high/medium impact).',
  { symbols: z.array(z.string()).optional().describe('Also pull headlines for these tickers. Default: the watchlist') },
  wrap(({ symbols }) => getNews(symbols || loadConfig().watchlist)));

server.tool('brief_get', 'Read today\'s brief (or the latest one).', {}, wrap(() => readBrief() || 'No brief yet. Run: npm run brief'));
server.tool('brief_save', 'Save today\'s morning brief (Markdown). It shows in the desk sidebar.',
  { markdown: z.string().min(20) }, wrap(({ markdown }) => 'Saved to ' + saveBrief(markdown)));
server.tool('rules_get', 'Read the trader\'s own rules (my-rules.md). Always read these before marking a chart or writing a brief.',
  {}, wrap(() => readRules() || 'my-rules.md is empty.'));

await server.connect(new StdioServerTransport());
