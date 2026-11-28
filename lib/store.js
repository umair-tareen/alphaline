// Drawings live in data/drawings/<SYMBOL>.json. Plain JSON so anyone can read, back up or wipe them.
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { DATA, readJsonFile, writeJsonFile, withLock, fileSafe } from './config.js';

const fileFor = s => path.join(DATA, 'drawings', fileSafe(s) + '.json');
const locked = (symbol, fn) => withLock(fileFor(symbol), fn);

export function listDrawings(symbol) {
  return readJsonFile(fileFor(symbol), { symbol: String(symbol).toUpperCase(), items: [] }).items;
}

function save(symbol, items) {
  writeJsonFile(fileFor(symbol), { symbol: String(symbol).toUpperCase(), updated: new Date().toISOString(), items });
}

export function addDrawing(symbol, item) {
  return locked(symbol, () => {
  const items = listDrawings(symbol);
  const d = { id: crypto.randomBytes(3).toString('hex'), created: new Date().toISOString(), source: 'ai', ...item };
  items.push(d);
  save(symbol, items);
  return d;
  });
}

export function replaceSource(symbol, source, newItems) {
  return locked(symbol, () => {
  const keep = listDrawings(symbol).filter(d => d.source !== source);
  const added = newItems.map(i => ({ id: crypto.randomBytes(3).toString('hex'), created: new Date().toISOString(), source, ...i }));
  save(symbol, [...keep, ...added]);
  return added;
  });
}

export function acceptDrawing(symbol, id) {
  return locked(symbol, () => {
  const items = listDrawings(symbol);
  let n = 0;
  for (const d of items) if (d.id === id && d.status === 'suggested') { delete d.status; n++; }
  save(symbol, items);
  return n;
  });
}

export function removeDrawing(symbol, id) {
  return locked(symbol, () => {
  const items = listDrawings(symbol);
  const left = items.filter(d => d.id !== id);
  save(symbol, left);
  return items.length - left.length;
  });
}

export function clearDrawings(symbol, source = 'ai') {
  return locked(symbol, () => {
  const items = listDrawings(symbol);
  const left = source === 'all' ? [] : items.filter(d => d.source !== source);
  save(symbol, left);
  return items.length - left.length;
  });
}

export function symbolsWithDrawings() {
  const dir = path.join(DATA, 'drawings');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5).replace(/_([0-9a-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))) : [];
}
