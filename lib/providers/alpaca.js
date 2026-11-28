// Alpaca market data. A free Alpaca account gives an API key with the IEX feed.
import { aggregate } from '../aggregate.js';
import { parseTime } from '../time.js';
const TF = { '5m': '5Min', '15m': '15Min', '1h': '30Min', '1d': '1Day' }; // 1h is built from 30Min so it starts on the 9:30 open
const DAYS = { '5m': 7, '15m': 30, '1h': 90, '1d': 400 };

export const label = 'Alpaca (IEX)';

// The full consolidated tape from 04:00 to 09:30 (or 16 minutes ago, whichever is earlier). Alpaca serves SIP history
// older than 15 minutes on free keys, so this works without a paid plan. Used for pre-market levels when the chart
// source starts its pre-market later (Schwab: 07:00).
const early = new Map();
export async function earlyPremarket(symbol, date, secrets) {
  const k = secrets.alpaca || {};
  if (!k.keyId || !k.secretKey || k.keyId.startsWith('PASTE')) return [];
  const hit = early.get(symbol + date);
  if (hit && (hit.done || Date.now() - hit.at < 60e3)) return hit.bars;
  const start = parseTime(date + ' 04:00'), open = parseTime(date + ' 09:30'), end = Math.min(open, Math.floor(Date.now() / 1000) - 16 * 60);
  if (end <= start) return [];
  const r = await fetch(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=1Min&feed=sip&adjustment=raw&limit=10000`
    + `&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`,
    { headers: { 'APCA-API-KEY-ID': k.keyId, 'APCA-API-SECRET-KEY': k.secretKey } });
  if (!r.ok) throw new Error(`Alpaca answered ${r.status}`);
  const bars = ((await r.json()).bars || []).map(b => ({ time: Math.floor(Date.parse(b.t) / 1000), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
  early.set(symbol + date, { bars, at: Date.now(), done: end === open });
  return bars;
}

export async function getBars(symbol, tf, secrets) {
  const k = secrets.alpaca || {};
  if (!k.keyId || !k.secretKey || k.keyId.startsWith('PASTE')) throw new Error('Add your free Alpaca keys to config.local.json (see SETUP.md).');
  const start = new Date(Date.now() - DAYS[tf] * 864e5).toISOString();
  const base = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${TF[tf]}&start=${start}&limit=10000&adjustment=split&feed=${k.feed || 'iex'}`;
  const out = [];
  let token = null;
  do {
    const r = await fetch(base + (token ? '&page_token=' + token : ''), {
      headers: { 'APCA-API-KEY-ID': k.keyId, 'APCA-API-SECRET-KEY': k.secretKey },
    });
    if (!r.ok) throw new Error(`Alpaca answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    for (const b of j.bars || []) out.push({ time: Math.floor(Date.parse(b.t) / 1000), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v });
    token = j.next_page_token;
  } while (token);
  return tf === '1h' ? aggregate(out, 3600) : out;
}
