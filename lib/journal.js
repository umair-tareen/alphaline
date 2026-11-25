// The trade journal: one CSV in data/journal.csv that opens in Excel, Numbers or Google Sheets.
import fs from 'node:fs';
import path from 'node:path';
import { DATA, ROOT } from './config.js';

export const JOURNAL = path.join(DATA, 'journal.csv');
export const COLUMNS = ['date', 'symbol', 'side', 'entry', 'exit', 'shares', 'stop', 'result_r', 'setup', 'rule_followed', 'emotion', 'notes'];

function ensure() {
  if (!fs.existsSync(JOURNAL)) fs.copyFileSync(path.join(ROOT, 'kit', 'journal-template.csv'), JOURNAL);
}
const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export function readJournal(which = 'mine') {
  if (which === 'sample') return fs.readFileSync(path.join(ROOT, 'kit', 'sample-week.csv'), 'utf8');
  ensure();
  return fs.readFileSync(JOURNAL, 'utf8');
}

export function addTrade(t) {
  ensure();
  const row = COLUMNS.map(c => cell(t[c])).join(',');
  const cur = fs.readFileSync(JOURNAL, 'utf8');
  fs.writeFileSync(JOURNAL, cur + (cur.endsWith('\n') ? '' : '\n') + row + '\n');
  return row;
}

// Position size from the risk rule, done by code so it is never a guess.
export function sizePosition({ account, riskPct, entry, stop }) {
  const perShare = Math.abs(entry - stop);
  if (!(perShare > 0)) throw new Error('Entry and stop must be different prices');
  const riskDollars = account * (riskPct / 100);
  const shares = Math.floor(riskDollars / perShare);
  return { riskDollars: Math.round(riskDollars * 100) / 100, riskPerShare: Math.round(perShare * 100) / 100, shares, positionValue: Math.round(shares * entry * 100) / 100 };
}
