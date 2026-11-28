import fs from 'node:fs';
import crypto from 'node:crypto';
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
  const s = readJson(path.join(ROOT, 'config.local.json'), {});
  // Alpaca's standard environment variables work too (keys stay out of files).
  const e = process.env;
  if (!s.alpaca?.keyId && e.APCA_API_KEY_ID && e.APCA_API_SECRET_KEY) s.alpaca = { ...s.alpaca, keyId: e.APCA_API_KEY_ID, secretKey: e.APCA_API_SECRET_KEY };
  return s;
}

export function readJsonFile(f, fallback) { return readJson(f, fallback); }

export function writeJsonFile(f, value) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  // A temp name of its own: the web server and the MCP server are separate processes that save the same files.
  const tmp = `${f}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), path.basename(path.dirname(f)) === 'secrets' ? { mode: 0o600 } : undefined);
  fs.renameSync(tmp, f);
}
