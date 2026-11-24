// Demo: does what your AI would do for "mark SPY using my rules", through the same MCP tools.
// Run: node scripts/demo-markup.js   (with the desk open, the marks appear live)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const c = new Client({ name: 'demo', version: '1' });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('../mcp.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')] }));
const call = async (name, a) => JSON.parse((await c.callTool({ name, arguments: a })).content[0].text);
await call('chart_clear', { symbol: 'SPY', source: 'all' });
const L = await call('chart_levels', { symbol: 'SPY' });
await call('chart_draw_level', { symbol: 'SPY', price: L.prior.high, label: 'PDH: gap-up must hold', kind: 'support' });
await call('chart_draw_level', { symbol: 'SPY', price: L.premarket.high, label: 'PMH', kind: 'resistance' });
await call('chart_draw_level', { symbol: 'SPY', price: L.vwap, label: 'VWAP', kind: 'custom', color: '#f0b429' });
await call('chart_draw_zone', { symbol: 'SPY', top: L.gap.to, bottom: L.gap.from, from: L.gap.time, label: 'Open gap +' + L.gap.size + ' unfilled', kind: 'gap' });
const near = L.fvgs.filter(f => Math.abs((f.top + f.bottom) / 2 - L.last) < L.atr);
for (const f of near.slice(-2)) await call('chart_draw_zone', { symbol: 'SPY', top: f.top, bottom: f.bottom, from: f.from, label: f.dir === 'bull' ? '15m FVG below' : '15m FVG above', kind: f.dir === 'bull' ? 'fvg-bull' : 'fvg-bear' });
await call('chart_add_note', { symbol: 'SPY', text: 'Opened above PDH', time: L.gap.time });
console.log(JSON.stringify({ near: near.length, L: { last: L.last, atr: L.atr } }));
await c.close();