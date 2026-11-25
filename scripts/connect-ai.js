// Adds Alphaline to the Claude desktop app (and to Codex, if it's installed), so nobody edits settings files by hand.
// Run: double-click "Connect Claude", or: node scripts/connect-ai.js
// Testing: set CLAUDE_CONFIG_PATH and CODEX_HOME to write somewhere else.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../lib/config.js';

const mcp = path.join(ROOT, 'mcp.js');
const entry = { command: process.execPath, args: [mcp] };
const home = os.homedir();
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

function claudeConfigPaths() {
  if (process.env.CLAUDE_CONFIG_PATH) return [process.env.CLAUDE_CONFIG_PATH];
  if (process.platform === 'win32') {
    const out = [path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')];
    // The Microsoft Store version keeps its settings inside its package folder.
    const pk = path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Packages');
    if (fs.existsSync(pk)) for (const d of fs.readdirSync(pk).filter(d => /^Claude_/i.test(d))) out.push(path.join(pk, d, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
    return out;
  }
  if (process.platform === 'darwin') return [path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')];
  return [path.join(home, '.config', 'Claude', 'claude_desktop_config.json')];
}

function connectClaude(file) {
  let cfg = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8').replace(/^\u{FEFF}/u, ''); // Notepad and PowerShell can add an invisible BOM
    try { cfg = raw.trim() ? JSON.parse(raw) : {}; }
    catch { console.log('  Your Claude settings file could not be read, so it was left alone: ' + file); return false; }
    fs.copyFileSync(file, file + '.before-alphaline-' + stamp);
  }
  cfg.mcpServers = { ...(cfg.mcpServers || {}), alphaline: entry };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  console.log('  Claude: connected (' + file + ')');
  return true;
}

function connectCodex() {
  const dir = process.env.CODEX_HOME || path.join(home, '.codex');
  if (!fs.existsSync(dir)) return false;
  const file = path.join(dir, 'config.toml');
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (/\[mcp_servers\.alphaline\]/.test(old)) { console.log('  Codex: already connected'); return true; }
  if (old) fs.copyFileSync(file, file + '.before-alphaline-' + stamp);
  const lit = s => "'" + s.replace(/'/g, '') + "'";
  fs.writeFileSync(file, old + (old && !old.endsWith('\n') ? '\n' : '') + '\n[mcp_servers.alphaline]\ncommand = ' + lit(entry.command) + '\nargs = [' + lit(mcp) + ']\n');
  console.log('  Codex: connected (' + file + ')');
  return true;
}

console.log('Connecting Alphaline to your AI...');
const claude = claudeConfigPaths().map(connectClaude).some(Boolean);
const codex = connectCodex();
console.log('');
if (claude) console.log('Done. Now quit Claude completely (on Windows: right-click its icon by the clock and choose Quit) and open it again.');
if (codex) console.log('Codex will pick up Alphaline the next time you start it in any folder.');
if (!claude && !codex) console.log('No Claude or Codex settings were found. Install the Claude desktop app from claude.ai/download, open it once, then run this again.');
console.log('Then ask your AI: "What tools do you have from Alphaline?"');
