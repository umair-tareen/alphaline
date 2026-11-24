import path from 'node:path';
import fs from 'node:fs';
import { DATA, loadConfig, loadSecrets, readJsonFile, writeJsonFile } from './config.js';
import * as demo from './providers/demo.js';
import * as alpaca from './providers/alpaca.js';
import * as schwab from './providers/schwab.js';

export const PROVIDERS = { demo, alpaca, schwab };
export const TIMEFRAMES = ['5m', '15m', '1h', '1d'];

export function providerInfo() {
  const cfg = loadConfig();
  const p = PROVIDERS[cfg.provider];
  return { id: cfg.provider, label: p ? p.label : 'Unknown provider: ' + cfg.provider };
}

// Every download is saved under data/bars, so the desk still opens offline with the last copy.
export async function getBars(symbol, tf = '5m') {
  symbol = String(symbol).trim().toUpperCase();
  if (!/^[A-Z0-9.\-^=]{1,15}$/.test(symbol)) throw new Error('That does not look like a ticker: ' + symbol);
  if (!TIMEFRAMES.includes(tf)) throw new Error('Timeframe must be one of ' + TIMEFRAMES.join(', '));
  const cfg = loadConfig();
  const provider = PROVIDERS[cfg.provider];
  if (!provider) throw new Error(`config.json provider "${cfg.provider}" is not one of ${Object.keys(PROVIDERS).join(', ')}`);
  const file = path.join(DATA, 'bars', `${cfg.provider}_${symbol.replace(/[^A-Z0-9]/g, '_')}_${tf}.json`);
  const cached = readJsonFile(file, null);
  const ttl = tf === '1d' ? 3600 : 45;
  const now = Math.floor(Date.now() / 1000);
  if (cached && now - cached.fetchedAt < ttl) return { ...cached, stale: false };
  try {
    const bars = await provider.getBars(symbol, tf, loadSecrets());
    if (!bars.length) throw new Error('No bars returned for ' + symbol);
    const value = { symbol, tf, provider: cfg.provider, fetchedAt: now, bars };
    writeJsonFile(file, value);
    return { ...value, stale: false };
  } catch (e) {
    if (cached) return { ...cached, stale: true, error: e.message };
    throw e;
  }
}

export function clearBarCache() {
  const dir = path.join(DATA, 'bars');
  let n = 0;
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) { fs.unlinkSync(path.join(dir, f)); n++; }
  return n;
}
