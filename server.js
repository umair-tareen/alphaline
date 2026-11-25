// Alphaline: local web server. Open http://localhost:4321 after "npm start".
import http from 'node:http';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA, ensureDirs, loadConfig } from './lib/config.js';
import { getBars, providerInfo, listProviders, loadPlugins } from './lib/bars.js';
import { writeJsonFile } from './lib/config.js';
import { listDrawings, removeDrawing } from './lib/store.js';
import { autoMark, levelsFor, getState, readBrief, readRules } from './lib/desk.js';
import { computeIndicators, loadIndicators, saveIndicators, CONFIG_FILE, CUSTOM_DIR } from './lib/indicators.js';
import { acceptDrawing } from './lib/store.js';

ensureDirs();
const cfg = loadConfig();
const PORT = Number(process.env.PORT || cfg.port || 4321);
const CHART_LIB = path.join(ROOT, 'node_modules', 'klinecharts', 'dist', 'umd', 'klinecharts.min.js');

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};


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
  'GET /vendor/klinecharts.js': (_q, res) => send(res, 200, fs.readFileSync(CHART_LIB), 'text/javascript'),
  'GET /api/config': (_q, res) => send(res, 200, { watchlist: loadConfig().watchlist, provider: providerInfo(), state: getState() }),
  'GET /api/bars': async (q, res) => {
    const r = await getBars(q.get('symbol') || 'SPY', q.get('tf') || '5m');
    send(res, 200, r);
  },
  'GET /api/indicators': async (q, res) => {
    const r = await getBars(q.get('symbol') || 'SPY', q.get('tf') || '5m');
    const ind = await computeIndicators(r.bars);
    send(res, 200, ind);
  },
  'GET /api/providers': async (_q, res) => send(res, 200, { current: loadConfig().provider, providers: await listProviders() }),
  'POST /api/provider': async (q, res) => {
    const id = q.get('id');
    if (!(await loadPlugins())[id]) return send(res, 404, { error: 'No data source called ' + id });
    writeJsonFile(path.join(ROOT, 'config.json'), { ...loadConfig(), provider: id });
    send(res, 200, { provider: providerInfo() });
  },
  'GET /api/indicators/config': (_q, res) => send(res, 200, loadIndicators()),
  'POST /api/indicators/toggle': (q, res) => {
    const list = loadIndicators();
    const item = list.find(x => x.id === q.get('id'));
    if (!item) return send(res, 404, { error: 'No indicator ' + q.get('id') });
    item.enabled = q.get('enabled') === 'true';
    saveIndicators(list);
    send(res, 200, item);
  },
  'POST /api/drawings/accept': (q, res) => send(res, 200, { accepted: acceptDrawing(q.get('symbol'), q.get('id')) }),
  'GET /api/drawings': (q, res) => send(res, 200, listDrawings(q.get('symbol') || 'SPY')),
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
}).on('error', e => {
  if (e.code === 'EADDRINUSE') { console.log(`Alphaline is already running at http://localhost:${PORT}`); if (process.argv.includes('--open')) exec(process.platform === 'win32' ? `start "" "http://localhost:${PORT}"` : `open "http://localhost:${PORT}"`); }
  else throw e;
}).listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Alphaline is running: ${url}  (data: ${providerInfo().label})`);
  console.log('Keep this window open while you use Alphaline. Close it to stop.');
  if (process.argv.includes('--open')) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
  }
});
