// Headlines from public RSS feeds plus this week's economic calendar. Set the sources in config.json.
import path from 'node:path';
import { DATA, loadConfig, writeJsonFile } from './config.js';
import { todayET, etParts } from './time.js';

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&').trim();
const tag = (xml, name) => { const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml); return m ? decode(m[1]) : ''; };

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (alphaline)' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.text();
}

async function readFeed(name, url) {
  const xml = await fetchText(url);
  const items = xml.split(/<item[\s>]/i).slice(1).map(chunk => ({
    source: name, title: tag(chunk, 'title'), link: /^https?:\/\//i.test(tag(chunk, 'link').trim()) ? tag(chunk, 'link').trim() : '',  // feeds can carry javascript: links
    time: Date.parse(tag(chunk, 'pubDate') || tag(chunk, 'dc:date')) || null,
  }));
  return items.filter(i => i.title);
}

export async function getNews(symbols = []) {
  const cfg = loadConfig().news || {};
  const sources = [...(cfg.feeds || [])];
  if (cfg.symbolFeed) for (const s of symbols) sources.push({ name: s.toUpperCase() + ' headlines', url: cfg.symbolFeed.replace('{symbol}', encodeURIComponent(s)) });
  const errors = [];
  const results = await Promise.all(sources.map(f => readFeed(f.name, f.url).catch(e => { errors.push(`${f.name}: ${e.message}`); return []; })));
  const since = Date.now() - 36 * 3600e3;
  const seen = new Set();
  const headlines = results.flat()
    .filter(h => !h.time || h.time >= since)
    .filter(h => { const k = h.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.time || 0) - (a.time || 0))
    .slice(0, cfg.maxHeadlines || 30)
    .map(h => ({ ...h, time: h.time ? new Date(h.time).toISOString() : null }));

  let calendar = [];
  if (cfg.calendarUrl) {
    try {
      const events = JSON.parse(await fetchText(cfg.calendarUrl));
      const today = todayET();
      calendar = events
        .filter(e => (cfg.calendarCountries || ['USD']).includes(e.country) && (cfg.calendarImpact || ['High']).includes(e.impact))
        .map(e => {
          const sec = Math.floor(Date.parse(e.date) / 1000);
          const p = etParts(sec);
          return { date: p.date, timeET: `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`, event: e.title, impact: e.impact, forecast: e.forecast || null, previous: e.previous || null, today: p.date === today };
        })
        .filter(e => e.date >= today);
    } catch (e) { errors.push('Economic calendar: ' + e.message); }
  }
  const out = { fetchedAt: new Date().toISOString(), headlines, calendar, errors };
  writeJsonFile(path.join(DATA, 'news', todayET() + '.json'), out);
  return out;
}
