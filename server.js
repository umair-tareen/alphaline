// ATP Chart Desk: local web server. Open http://localhost:4321 after "npm start".
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA, ensureDirs, loadConfig } from './lib/config.js';
import { getBars, providerInfo } from './lib/bars.js';
import { listDrawings, removeDrawing } from './lib/store.js';
import { autoMark, levelsFor, getState, readBrief, readRules } from './lib/desk.js';
import { toChartTime } from './lib/time.js';
import { computeIndicators, CONFIG_FILE, CUSTOM_DIR } from './lib/indicators.js';
import { acceptDrawing } from './lib/store.js';

ensureDirs();
const cfg = loadConfig();
const PORT = Number(process.env.PORT || cfg.port || 4321);
const LWC = path.join(ROOT, 'node_modules', 'lightweight-charts', 'dist', 'lightweight-charts.standalone.production.js');

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const chartDrawing = d => ({ ...d, from: d.from != null ? toChartTime(d.from) : d.from, time: d.time != null ? toChartTime(d.time) : d.time });

const clients = new Set();
let timer = null;
fs.watch(DATA, { recursive: true }, (_e, name) => {
  if (!name || name.startsWith('bars') || name.endsWith('.tmp')) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const what = name.startsWith('drawings') ? 'drawings' : name.startsWith('briefs') ? 'brief' : name.startsWith('state') ? 'state' : 'other';
    for (const c of clients) c.write(`data: ${JSON.stringify({ what, name })}\n\n`);
  }, 120);
});

const shout = what => { for (const c of clients) c.write(`data: ${JSON.stringify({ what })}\n\n`); };
let indTimer = null;
const onIndicators = () => { clearTimeout(indTimer); indTimer = setTimeout(() => shout('indicators'), 150); };
fs.watch(path.dirname(CONFIG_FILE), (_e, name) => { if (name === 'indicators.json') onIndicators(); });
if (fs.existsSync(CUSTOM_DIR)) fs.watch(CUSTOM_DIR, onIndicators);

const routes = {
  'GET /': (_q, res) => send(res, 200, fs.readFileSync(path.join(ROOT, 'public', 'index.html')), 'text/html; charset=utf-8'),
  'GET /vendor/lightweight-charts.js': (_q, res) => send(res, 200, fs.readFileSync(LWC), 'text/javascript'),
  'GET /api/config': (_q, res) => send(res, 200, { watchlist: loadConfig().watchlist, provider: providerInfo(), state: getState() }),
  'GET /api/bars': async (q, res) => {
    const r = await getBars(q.get('symbol') || 'SPY', q.get('tf') || '5m');
    send(res, 200, { ...r, bars: r.bars.map(b => ({ ...b, time: toChartTime(b.time) })) });
  },
  'GET /api/indicators': async (q, res) => {
    const r = await getBars(q.get('symbol') || 'SPY', q.get('tf') || '5m');
    const ind = await computeIndicators(r.bars);
    const shift = pts => pts.map(p => ({ ...p, time: toChartTime(p.time) }));
    send(res, 200, { ...ind, lines: ind.lines.map(l => ({ ...l, points: shift(l.points) })), volume: ind.volume && { ...ind.volume, avg: shift(ind.volume.avg) } });
  },
  'POST /api/drawings/accept': (q, res) => send(res, 200, { accepted: acceptDrawing(q.get('symbol'), q.get('id')) }),
  'GET /api/drawings': (q, res) => send(res, 200, listDrawings(q.get('symbol') || 'SPY').map(chartDrawing)),
  'DELETE /api/drawings': (q, res) => send(res, 200, { removed: removeDrawing(q.get('symbol'), q.get('id')) }),
  'POST /api/auto': async (q, res) => send(res, 200, await autoMark(q.get('symbol') || 'SPY')),
  'GET /api/levels': async (q, res) => send(res, 200, await levelsFor(q.get('symbol') || 'SPY')),
  'GET /api/brief': (_q, res) => send(res, 200, readBrief() || {}),
  'GET /api/rules': (_q, res) => send(res, 200, { markdown: readRules() }),
  'GET /api/events': (_q, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': hello\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    res.on('close', () => { clearInterval(ping); clients.delete(res); });
  },
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return send(res, 404, { error: 'Not found' });
  try { await handler(url.searchParams, res); }
  catch (e) { send(res, 500, { error: e.message }); }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`ATP Chart Desk is running: http://localhost:${PORT}  (data: ${providerInfo().label})`);
});
