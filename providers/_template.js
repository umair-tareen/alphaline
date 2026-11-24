// Add your own data source. Copy this file to providers/<name>.js, fill in getBars,
// then pick it in the app (Data) or set "provider": "<name>" in config.json. Ask your AI to write one for you:
// "write an Alphaline provider for <my broker or data API>".
//
// getBars(symbol, timeframe, secrets) returns candles oldest first:
//   [{ time: <unix seconds>, open, high, low, close, volume }]
// timeframe is one of '5m', '15m', '1h', '1d'. secrets is config.local.json (keep keys there, never in this file).
//
// Optional, for order-flow views (footprint, depth heatmap) once a feed supports them:
//   getTrades(symbol, from, to, secrets) -> [{ time, price, size, side: 'buy' | 'sell' }]
//   getDepth(symbol, secrets) -> { time, bids: [[price, size]], asks: [[price, size]] }

export const label = 'My data source';

export async function getBars(symbol, timeframe, secrets) {
  throw new Error('Template only: copy providers/_template.js to a new file and fill in getBars');
}
