// Market time helpers. Everything is stored as UTC seconds and shown in New York time.
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function etParts(sec) {
  const p = {};
  for (const x of fmt.formatToParts(new Date(sec * 1000))) p[x.type] = x.value;
  const y = +p.year, m = +p.month, d = +p.day, h = +p.hour % 24, mi = +p.minute, s = +p.second;
  return { date: `${p.year}-${p.month}-${p.day}`, y, m, d, h, mi, s, minutes: h * 60 + mi };
}

export function etOffsetSec(sec) {
  const p = etParts(sec);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) / 1000 - sec;
}

// Lightweight Charts shows timestamps as UTC, so shift them to read as New York time.
export const toChartTime = sec => sec + etOffsetSec(sec);

// NYSE 13:00 early closes, from the exchange calendar. ponytail: hardcoded through 2028; add each new year's dates.
const EARLY_CLOSE = new Set(['2024-07-03', '2024-11-29', '2024-12-24', '2025-07-03', '2025-11-28', '2025-12-24',
  '2026-11-27', '2026-12-24', '2027-11-26', '2028-07-03', '2028-11-24']);

export function session(sec) {
  const { minutes, date } = etParts(sec);
  const close = EARLY_CLOSE.has(date) ? 780 : 960;
  if (minutes >= 240 && minutes < 570) return 'pre';
  if (minutes >= 570 && minutes < close) return 'rth';
  if (minutes >= close && minutes < 1200) return 'post';
  return 'closed';
}

export const nowSec = () => Math.floor(Date.now() / 1000);
export const todayET = () => etParts(nowSec()).date;
export const fmtET = sec => { const p = etParts(sec); return `${p.date} ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`; };

// Accepts unix seconds, an ISO string, or "YYYY-MM-DD HH:MM" / "YYYY-MM-DD" read as New York time.
export function parseTime(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : v;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(String(v).trim());
  if (m) {
    const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 9), +(m[5] || (m[4] ? 0 : 30))) / 1000;
    let sec = naive - etOffsetSec(naive);
    sec = naive - etOffsetSec(sec);
    return sec;
  }
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error('Could not read time: ' + v);
  return Math.floor(t / 1000);
}
