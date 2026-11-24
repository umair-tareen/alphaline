import path from 'node:path';
import fs from 'node:fs';
import { DATA, loadConfig, loadSecrets, readJsonFile, writeJsonFile } from './config.js';
import * as demo from './providers/demo.js';
import * as alpaca from './providers/alpaca.js';
import * as schwab from './providers/schwab.js';
import * as csv from './providers/csv.js';
import { pathToFileURL } from 'node:url';
import { ROOT } from './config.js';

const BUILT_IN = { demo, csv, alpaca, schwab };
export const PROVIDERS = { ...BUILT_IN };

// Plug-ins: every providers/<name>.js (except files starting with _) becomes a data source.
export async function loadPlugins() {
  const dir = path.join(ROOT, 'providers');
  if (!fs.existsSync(dir)) return PROVIDERS;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.startsWith('_'))) {
    const file = path.join(dir, f);
    try { PROVIDERS[f.slice(0, -3)] = await import(pathToFileURL(file).href + '?v=' + fs.statSync(file).mtimeMs); }
    catch (e) { PROVIDERS[f.slice(0, -3)] = { label: f + ' (could not load: ' + e.message + ')', getBars: async () => { throw e; } }; }
  }
  return PROVIDERS;
}

export async function listProviders() {
  await loadPlugins();
  const s = loadSecrets();
  const needs = { alpaca: !s.alpaca?.keyId || s.alpaca.keyId.startsWith('PASTE'), schwab: !s.schwab?.appKey || s.schwab.appKey.startsWith('PASTE') };
  return Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label || id, builtIn: id in BUILT_IN, needsSetup: !!needs[id], imports: id === 'csv' ? csv.listImports() : undefined }));
}
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
  if (!PROVIDERS[cfg.provider]) await loadPlugins();
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
