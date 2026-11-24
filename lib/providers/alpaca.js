// Alpaca market data. A free Alpaca account gives an API key with the IEX feed.
const TF = { '5m': '5Min', '15m': '15Min', '1h': '1Hour', '1d': '1Day' };
const DAYS = { '5m': 7, '15m': 30, '1h': 90, '1d': 400 };

export const label = 'Alpaca (IEX)';

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
  return out;
}
