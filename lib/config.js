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

export const CONFIG_JSON = path.join(ROOT, 'config.json');

// A broken config.json is an error, not "use the defaults": the next save would write the defaults over the trader's file.
export function loadConfig() {
  let cfg = {};
  if (fs.existsSync(CONFIG_JSON)) {
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_JSON, 'utf8')); }
    catch (e) { throw new Error(`config.json is not valid JSON (${e.message}). Fix it, or restore it with: git checkout config.json`); }
  }
  return { provider: 'demo', watchlist: ['SPY'], port: 4321, news: {}, ...cfg };
}

// Change config.json under the save lock.
export const updateConfig = fn => withLock(CONFIG_JSON, () => { const cfg = loadConfig(); fn(cfg); writeJsonFile(CONFIG_JSON, cfg); return cfg; });

// A symbol as a file name. Every character other than A-Z and 0-9 gets its own code, so BRK.B, BRK-B and BRK_B stay apart.
export const fileSafe = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, c => '_' + c.charCodeAt(0).toString(16));

// One writer at a time for read-modify-write saves: the web server and the MCP server are separate processes.
// ponytail: a lock file plus a short spin-wait; a lock older than 10 s is treated as left behind by a crash.
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export function withLock(f, fn) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const lock = f + '.lock';
  for (let i = 0; ; i++) {
    try { fs.closeSync(fs.openSync(lock, 'wx')); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10000) { fs.unlinkSync(lock); continue; } } catch {}
      if (i >= 300) throw new Error('Another save is still in progress on ' + path.basename(f) + '. Try again.');
      pause(10);
    }
  }
  try { return fn(); } finally { try { fs.unlinkSync(lock); } catch {} }
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
