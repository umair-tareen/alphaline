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
lines.push('## Scheduled news today (New York time)');
lines.push(todays.length ? todays.map(e => `- **${e.timeET}** ${e.event} (${e.impact}${e.forecast ? ', forecast ' + e.forecast : ''}${e.previous ? ', previous ' + e.previous : ''})`).join('\n') : '- No high or medium impact US events today.');
lines.push('');

lines.push('## Levels');
for (const s of cfg.watchlist) {
  try {
    const { levels: L } = await autoMark(s);
    const parts = [];
    if (L.prior) parts.push(`yesterday's high ${L.prior.high}, low ${L.prior.low}, close ${L.prior.close}`);
    if (L.premarket) parts.push(`pre-market high ${L.premarket.high}, low ${L.premarket.low}`);
    if (L.gap) parts.push(`gap ${L.gap.direction} of ${Math.abs(L.gap.size)} (${Math.abs(L.gap.pct)}%)${L.gap.filled ? ', since filled' : ', not filled'}`);
    if (L.atr) parts.push(`moves about ${L.atr} on a normal day`);
    lines.push(`- **${L.symbol}** at ${L.last}: ${parts.join('; ')}`);
  } catch (e) { lines.push(`- **${s}**: could not load (${e.message})`); }
}
lines.push('');
lines.push('## Headlines');
lines.push(news.headlines.slice(0, 12).map(h => `- ${h.title} _(${h.source})_`).join('\n') || '- None fetched.');
if (news.errors.length) lines.push('', '_Sources that failed: ' + news.errors.join('; ') + '_');

const f = briefPath(todayET(), 'facts');
fs.writeFileSync(f, lines.join('\n') + '\n');
console.log('Wrote ' + f);
