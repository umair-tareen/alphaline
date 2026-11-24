import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data');
export const DIRS = ['bars', 'drawings', 'briefs', 'news', 'secrets'].map(d => path.join(DATA, d));

function readJson(f, fallback) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; }
}

export function ensureDirs() {
  for (const d of DIRS) fs.mkdirSync(d, { recursive: true });
}

export function loadConfig() {
  const cfg = readJson(path.join(ROOT, 'config.json'), {});
  return { provider: 'demo', watchlist: ['SPY'], port: 4321, news: {}, ...cfg };
}

// API keys live in config.local.json, which git ignores. Never print them.
export function loadSecrets() {
  return readJson(path.join(ROOT, 'config.local.json'), {});
}

export function readJsonFile(f, fallback) { return readJson(f, fallback); }

export function writeJsonFile(f, value) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, f);
}
