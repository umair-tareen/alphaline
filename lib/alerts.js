// Price alerts: data/alerts.json. Checked by the open chart page every time prices refresh.
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA, readJsonFile, writeJsonFile } from './config.js';

const FILE = path.join(DATA, 'alerts.json');
export const listAlerts = () => readJsonFile(FILE, []);
const save = a => writeJsonFile(FILE, a);

export function addAlert({ symbol, price, direction, note }) {
  const a = listAlerts();
  const item = { id: crypto.randomBytes(3).toString('hex'), symbol: String(symbol).toUpperCase(), price: +price, direction: direction === 'below' ? 'below' : 'above', note: note || '', created: new Date().toISOString(), triggered: null };
  a.push(item); save(a); return item;
}
export function removeAlert(id) { const a = listAlerts(); const left = a.filter(x => x.id !== id); save(left); return a.length - left.length; }
export function markTriggered(id, price) {
  const a = listAlerts(); const x = a.find(x => x.id === id);
  if (x && !x.triggered) { x.triggered = new Date().toISOString(); x.triggeredAt = price; save(a); }
  return x;
}
