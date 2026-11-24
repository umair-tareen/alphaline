// Charles Schwab Market Data API (the same account as thinkorswim).
// Needs an approved app at developer.schwab.com and a login with: npm run schwab-login
import path from 'node:path';
import { DATA, readJsonFile, writeJsonFile } from '../config.js';
import { aggregate } from '../aggregate.js';

export const label = 'Schwab / thinkorswim';
const TOKEN_FILE = path.join(DATA, 'secrets', 'schwab-token.json');
const TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token';

const PARAMS = {
  '5m': 'periodType=day&period=5&frequencyType=minute&frequency=5',
  '15m': 'periodType=day&period=10&frequencyType=minute&frequency=15',
  '1h': 'periodType=day&period=10&frequencyType=minute&frequency=30',
  '1d': 'periodType=year&period=1&frequencyType=daily&frequency=1',
};

export async function exchangeToken(secrets, body) {
  const s = secrets.schwab || {};
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${s.appKey}:${s.appSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });
  if (!r.ok) throw new Error(`Schwab login answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.json();
  const now = Math.floor(Date.now() / 1000);
  const old = readJsonFile(TOKEN_FILE, {});
  const saved = {
    ...old, ...t,
    expires_at: now + (t.expires_in || 1800),
    refresh_expires_at: body.grant_type === 'authorization_code' ? now + 7 * 86400 : old.refresh_expires_at,
  };
  writeJsonFile(TOKEN_FILE, saved);
  return saved;
}

async function accessToken(secrets) {
  const s = secrets.schwab || {};
  if (!s.appKey || s.appKey.startsWith('PASTE')) throw new Error('Add your Schwab app key and secret to config.local.json (see SETUP.md).');
  let t = readJsonFile(TOKEN_FILE, null);
  if (!t) throw new Error('Not logged in to Schwab yet. Run: npm run schwab-login');
  const now = Math.floor(Date.now() / 1000);
  if (t.refresh_expires_at && t.refresh_expires_at < now) throw new Error('Your Schwab login expired (Schwab asks every 7 days). Run: npm run schwab-login');
  if (t.expires_at - 60 < now) t = await exchangeToken(secrets, { grant_type: 'refresh_token', refresh_token: t.refresh_token });
  return t.access_token;
}

export async function getBars(symbol, tf, secrets) {
  const token = await accessToken(secrets);
  const url = `https://api.schwabapi.com/marketdata/v1/pricehistory?symbol=${encodeURIComponent(symbol)}&${PARAMS[tf]}&needExtendedHoursData=${tf === '1d' ? 'false' : 'true'}`;
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Schwab answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const bars = (j.candles || []).map(c => ({ time: Math.floor(c.datetime / 1000), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 }));
  return tf === '1h' ? aggregate(bars, 3600) : bars;
}
