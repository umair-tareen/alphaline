// Price alerts: data/alerts.json. Checked by the open chart page every time prices refresh.
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA, readJsonFile, writeJsonFile, withLock } from './config.js';

const FILE = path.join(DATA, 'alerts.json');
export const listAlerts = () => readJsonFile(FILE, []);
const save = a => writeJsonFile(FILE, a);

export function addAlert({ symbol, price, direction, note }) {
  // An empty price field arrives as 0, and an "above 0" alert would ring at once.
  if (price === '' || price == null || !(Number(price) > 0)) throw Object.assign(new Error('Alert price must be a number above 0'), { status: 400 });
  return withLock(FILE, () => {
    const a = listAlerts();
    const item = { id: crypto.randomBytes(3).toString('hex'), symbol: String(symbol).toUpperCase(), price: +price, direction: direction === 'below' ? 'below' : 'above', note: note || '', created: new Date().toISOString(), triggered: null };
    a.push(item); save(a); return item;
  });
}
export function removeAlert(id) { return withLock(FILE, () => { const a = listAlerts(); const left = a.filter(x => x.id !== id); save(left); return a.length - left.length; }); }
// first: true only for the call that triggered it, so two open chart tabs don't both ring.
export function markTriggered(id, price) {
  return withLock(FILE, () => {
    const a = listAlerts(); const x = a.find(x => x.id === id);
    const first = !!x && !x.triggered;
    if (first) { x.triggered = new Date().toISOString(); x.triggeredAt = price; save(a); }
    return x ? { ...x, first } : null;
  });
}
