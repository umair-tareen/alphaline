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

export const splitCsvLine = l => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };

export function journalRows(which = 'mine') {
  const lines = readJournal(which).trim().split(/\r?\n/);
  const head = lines.shift().split(',');
  return lines.filter(Boolean).map(l => Object.fromEntries(splitCsvLine(l).map((v, i) => [head[i], v])));
}

export function journalStats(rows) {
  const r = rows.map(x => parseFloat(x.result_r)).filter(Number.isFinite);
  const wins = r.filter(v => v > 0).length, breaks = rows.filter(x => x.rule_followed === 'no');
  const rBreak = breaks.map(x => parseFloat(x.result_r)).filter(Number.isFinite).reduce((a, b) => a + b, 0);
  return { trades: rows.length, totalR: Math.round(r.reduce((a, b) => a + b, 0) * 100) / 100, winRate: r.length ? Math.round((wins / r.length) * 100) : null, ruleBreaks: breaks.length, rLostOnBreaks: Math.round(rBreak * 100) / 100 };
}

// Position size from the risk rule, done by code so it is never a guess.
// The side comes from the stop when it is not given, and the size never exceeds what the account can buy.
export function sizePosition({ account, riskPct, entry, stop, side }) {
  for (const [k, v] of Object.entries({ account, riskPct, entry, stop })) if (!(Number.isFinite(v) && v > 0)) throw new Error(`${k} must be a number above 0`);
  const perShare = Math.abs(entry - stop);
  if (!(perShare > 0)) throw new Error('Entry and stop must be different prices');
  if (side === 'long' && stop > entry) throw new Error('A long needs its stop below the entry');
  if (side === 'short' && stop < entry) throw new Error('A short needs its stop above the entry');
  const sideUsed = side || (stop < entry ? 'long' : 'short');
  const riskDollars = account * (riskPct / 100);
  const byRisk = Math.floor(riskDollars / perShare), byAccount = Math.floor(account / entry);
  const shares = Math.min(byRisk, byAccount);
  const out = { side: sideUsed, sideInferred: !side, riskDollars: Math.round(riskDollars * 100) / 100, riskPerShare: Math.round(perShare * 100) / 100, shares, positionValue: Math.round(shares * entry * 100) / 100, maxSharesByAccount: byAccount };
  if (byRisk > byAccount) out.note = `The risk rule allows ${byRisk} shares, but the account can only buy ${byAccount}. Capped at ${byAccount}, so the dollar risk is ${Math.round(byAccount * perShare * 100) / 100}.`;
  return out;
}
