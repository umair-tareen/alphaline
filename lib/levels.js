// Plain arithmetic, no AI: the facts Claude starts from. Claude decides what matters using my-rules.md.
import { etParts, session } from './time.js';
const fmtHM = sec => { const p = etParts(sec); return String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0'); };

const r2 = v => (v == null ? null : Math.round(v * 100) / 100);
const hl = arr => arr.length ? { high: Math.max(...arr.map(b => b.high)), low: Math.min(...arr.map(b => b.low)) } : null;

// Wilder's ATR, the standard one: a plain mean of the first n true ranges, then smoothed with weight 1/n.
export function atr(daily, n = 14) {
  if (daily.length < n + 1) return null;
  let a = 0;
  for (let i = 1; i < daily.length; i++) {
    const b = daily[i], pc = daily[i - 1].close;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
    a = i <= n ? a + tr / n : (a * (n - 1) + tr) / n;
  }
  return a;
}

// Off-exchange average-price prints show up as one-bar wicks that snap straight back. Trim any open, close or wick
// more than `cap` beyond the bar body and both neighbours. A real one-bar spike that size is trimmed too, so every
// change is pushed to `log` (when given) and reported with the levels. The first and last bar have only one
// neighbour and are never trimmed.
export function clipBadPrints(bars, cap, log = null) {
  if (!(cap > 0)) return bars;
  return bars.map((b, i) => {
    const prev = bars[i - 1], next = bars[i + 1];
    if (!prev || !next) return b;
    const hiRef = Math.max(prev.close, next.open), loRef = Math.min(prev.close, next.open);
    const fix = { ...b };
    for (const k of ['open', 'close']) if (fix[k] > hiRef + cap || fix[k] < loRef - cap) fix[k] = k === 'open' ? prev.close : next.open;
    const top = Math.max(fix.open, fix.close), bot = Math.min(fix.open, fix.close);
    if (fix.high > Math.max(top, hiRef) + cap) fix.high = top;
    if (fix.low < Math.min(bot, loRef) - cap) fix.low = bot;
    if (log) for (const k of ['open', 'high', 'low', 'close']) if (fix[k] !== b[k]) log.push({ time: b.time, field: k, from: b[k], to: fix[k] });
    return fix;
  });
}

export function splitSessions(intraday) {
  const days = new Map();
  for (const b of intraday) {
    const s = session(b.time);
    if (s === 'closed') continue;
    const d = etParts(b.time).date;
    if (!days.has(d)) days.set(d, { date: d, pre: [], rth: [], post: [] });
    days.get(d)[s].push(b);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Three-candle fair value gaps that price has not traded back through yet.
export function fairValueGaps(bars, minSize = 0, keep = 6, last = null) {
  const out = [];
  for (let i = 2; i < bars.length; i++) {
    const a = bars[i - 2], c = bars[i];
    if (etParts(a.time).date !== etParts(c.time).date) continue;  // an overnight jump is not a fast-move gap
    let gap = null;
    if (c.low > a.high) gap = { dir: 'bull', top: c.low, bottom: a.high };
    else if (c.high < a.low) gap = { dir: 'bear', top: a.low, bottom: c.high };
    if (!gap || gap.top - gap.bottom < minSize) continue;
    let filled = false;
    for (let j = i + 1; j < bars.length && !filled; j++) {
      filled = gap.dir === 'bull' ? bars[j].low <= gap.bottom : bars[j].high >= gap.top;
    }
    if (!filled) out.push({ ...gap, top: r2(gap.top), bottom: r2(gap.bottom), from: bars[i - 1].time });
  }
  if (last == null) return out.slice(-keep);
  const dist = g => (last > g.top ? last - g.top : last < g.bottom ? g.bottom - last : 0);
  return out.sort((a, b) => dist(a) - dist(b)).slice(0, keep).sort((a, b) => a.from - b.from);
}

// Price areas where daily swing highs and lows cluster.
export function swingZones(daily, last, atrValue, perSide = 3) {
  if (!daily.length || !atrValue) return [];
  const k = 3, pivots = [];
  for (let i = k; i < daily.length - k; i++) {
    const win = daily.slice(i - k, i + k + 1);
    if (daily[i].high === Math.max(...win.map(b => b.high))) pivots.push({ price: daily[i].high, time: daily[i].time });
    if (daily[i].low === Math.min(...win.map(b => b.low))) pivots.push({ price: daily[i].low, time: daily[i].time });
  }
  pivots.sort((a, b) => a.price - b.price);
  const tol = atrValue * 0.25, clusters = [];
  for (const p of pivots) {
    const c = clusters[clusters.length - 1];
    if (c && p.price - c.max <= tol) { c.max = p.price; c.n++; c.from = Math.min(c.from, p.time); }
    else clusters.push({ min: p.price, max: p.price, n: 1, from: p.time });
  }
  const pad = atrValue * 0.08;
  const zones = clusters.filter(c => c.n >= 2).map(c => ({
    top: r2(c.max + pad), bottom: r2(c.min - pad), touches: c.n, from: c.from,
    kind: (c.min + c.max) / 2 > last ? 'resistance' : 'support',
  }));
  const above = zones.filter(z => z.kind === 'resistance').sort((a, b) => a.bottom - b.bottom).slice(0, perSide);
  const below = zones.filter(z => z.kind === 'support').sort((a, b) => b.top - a.top).slice(0, perSide);
  return [...below.reverse(), ...above];
}

// early: optional 1-min bars from 04:00 (see alpaca.earlyPremarket) for sources whose pre-market starts later.
export function computeLevels(symbol, intraday, daily, fvgBars, early = []) {
  const today0 = splitSessions(intraday).at(-1);
  if (!today0) throw new Error('Not enough intraday data for ' + symbol);
  const a = atr(daily.filter(b => etParts(b.time).date < today0.date)); // completed days only
  const clipLog = [];
  intraday = clipBadPrints(intraday, a * 0.5, clipLog);
  fvgBars = fvgBars && clipBadPrints(fvgBars, a * 0.5);
  const days = splitSessions(intraday);
  const today = days[days.length - 1];
  const prior = [...days].reverse().find(d => d.date < today.date && d.rth.length);
  const last = intraday[intraday.length - 1].close;
  const out = { symbol, session: today.date, priorSession: prior?.date || null, last: r2(last), atr: r2(a) };

  if (prior) {
    const p = hl(prior.rth);
    // The official close is the closing auction print, stamped at the close (16:00, or 13:00 on a half day), which
    // the intraday split files under after-hours. The daily bar carries it, so use that when it is plausible.
    const rthClose = prior.rth[prior.rth.length - 1].close;
    const d = daily.find(b => etParts(b.time).date === prior.date);
    const okDaily = d && Number.isFinite(d.close) && Math.abs(d.close - rthClose) <= (a ? a * 0.5 : rthClose * 0.01);
    out.prior = { high: r2(p.high), low: r2(p.low), close: r2(okDaily ? d.close : rthClose), closeFrom: okDaily ? 'daily bar (official close)' : 'last regular-session bar' };
  }
  const pre = [...clipBadPrints(early.filter(b => etParts(b.time).date === today.date && session(b.time) === 'pre'), a * 0.5, clipLog), ...today.pre];
  const pm = hl(pre);
  if (pm) out.premarket = { high: r2(pm.high), low: r2(pm.low), from: pre.length ? fmtHM(Math.min(...pre.map(b => b.time))) : null };
  if (today.rth.length) {
    const open = today.rth[0].open;
    out.open = r2(open);
    const t = hl(today.rth);
    out.today = { high: r2(t.high), low: r2(t.low) };
    let pv = 0, v = 0;
    for (const b of today.rth) { pv += ((b.high + b.low + b.close) / 3) * b.volume; v += b.volume; }
    if (v > 0) out.vwap = r2(pv / v);
  }
  if (out.prior) {
    const ref = out.open ?? last;
    const size = ref - out.prior.close;
    const minGap = a ? a * 0.1 : 0;
    if (Math.abs(size) >= minGap && size !== 0) {
      const up = size > 0;
      let filled = false;
      if (today.rth.length) filled = up ? out.today.low <= out.prior.close : out.today.high >= out.prior.close;
      out.gap = {
        direction: up ? 'up' : 'down', from: out.prior.close, to: r2(ref), size: r2(size),
        pct: r2((size / out.prior.close) * 100), filled, basis: out.open != null ? 'open' : 'last price (before the open)',
        time: (today.rth[0] || today.pre[0] || intraday[intraday.length - 1]).time,
      };
    }
  }
  out.fvgs = fvgBars?.length ? fairValueGaps(fvgBars, a ? a * 0.05 : 0, 6, last) : [];
  out.zones = swingZones(daily, last, a);
  // Say which prints were treated as bad, so a real spike that got trimmed can be spotted and checked.
  const since = prior?.date || today.date;
  const seen = new Set();
  const clipped = clipLog.filter(c => etParts(c.time).date >= since).sort((x, y) => x.time - y.time)
    .filter(c => { const k = c.time + c.field; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(c => ({ at: etParts(c.time).date + ' ' + fmtHM(c.time), field: c.field, from: r2(c.from), to: r2(c.to) }));
  if (clipped.length) out.clipped = { note: 'One-bar prints more than half a daily ATR past both neighbouring bars were treated as bad prints and left out of these levels. Check them if a real spike may have been trimmed.', items: clipped.slice(-12) };
  return out;
}
