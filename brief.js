// The morning facts brief. No AI needed: levels for the watchlist, today's calendar and headlines.
// Schedule it (see SETUP.md), then let Claude or Codex turn it into your own brief with your rules.
import fs from 'node:fs';
import { ensureDirs, loadConfig } from './lib/config.js';
import { autoMark, briefPath } from './lib/desk.js';
import { getNews } from './lib/news.js';
import { todayET } from './lib/time.js';

ensureDirs();
const cfg = loadConfig();
const lines = [`# Morning facts · ${todayET()}`, '', '_Calculated by code from your data feed. Education only, not financial advice._', ''];

const news = await getNews(cfg.watchlist);
const todays = news.calendar.filter(e => e.today);
lines.push('## Calendar today (ET)');
lines.push(todays.length ? todays.map(e => `- **${e.timeET}** ${e.event} (${e.impact}${e.forecast ? ', forecast ' + e.forecast : ''}${e.previous ? ', previous ' + e.previous : ''})`).join('\n') : '- No high or medium impact US events today.');
lines.push('');

lines.push('## Levels');
for (const s of cfg.watchlist) {
  try {
    const { levels: L } = await autoMark(s);
    const parts = [];
    if (L.prior) parts.push(`PDH ${L.prior.high} · PDL ${L.prior.low} · PDC ${L.prior.close}`);
    if (L.premarket) parts.push(`PMH ${L.premarket.high} · PML ${L.premarket.low}`);
    if (L.gap) parts.push(`gap ${L.gap.direction} ${L.gap.size} (${L.gap.pct}%)${L.gap.filled ? ', filled' : ''}`);
    if (L.atr) parts.push(`ATR ${L.atr}`);
    lines.push(`- **${L.symbol}** last ${L.last}: ${parts.join(' · ')}`);
  } catch (e) { lines.push(`- **${s}**: could not load (${e.message})`); }
}
lines.push('');
lines.push('## Headlines');
lines.push(news.headlines.slice(0, 12).map(h => `- ${h.title} _(${h.source})_`).join('\n') || '- None fetched.');
if (news.errors.length) lines.push('', '_Sources that failed: ' + news.errors.join('; ') + '_');

const f = briefPath(todayET(), 'facts');
fs.writeFileSync(f, lines.join('\n') + '\n');
console.log('Wrote ' + f);
