// One-time Schwab login (repeat every 7 days; Schwab requires it).
import readline from 'node:readline/promises';
import { ensureDirs, loadSecrets } from '../lib/config.js';
import { exchangeToken } from '../lib/providers/schwab.js';

ensureDirs();
const s = loadSecrets().schwab || {};
if (!s.appKey || s.appKey.startsWith('PASTE')) { console.error('Put your Schwab appKey and appSecret in config.local.json first (see SETUP.md).'); process.exit(1); }
const redirect = s.redirectUri || 'https://127.0.0.1';
console.log('\n1. Open this link and log in to Schwab:\n');
console.log(`https://api.schwabapi.com/v1/oauth/authorize?client_id=${encodeURIComponent(s.appKey)}&redirect_uri=${encodeURIComponent(redirect)}\n`);
console.log('2. After you approve, the browser goes to a page that will not load. That is expected.');
console.log('   Copy the whole address from the address bar and paste it here.\n');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pasted = (await rl.question('Address: ')).trim();
rl.close();
const code = new URL(pasted).searchParams.get('code');
if (!code) { console.error('No code in that address. Try again.'); process.exit(1); }
await exchangeToken(loadSecrets(), { grant_type: 'authorization_code', code, redirect_uri: redirect });
console.log('\nLogged in. Set "provider": "schwab" in config.json and restart the desk.');
