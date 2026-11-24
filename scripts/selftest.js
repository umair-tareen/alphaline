// Starts the MCP server like Claude would and calls each tool once.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const symbol = process.argv[2] || 'SPY';
const client = new Client({ name: 'selftest', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['mcp.js'] }));
const { tools } = await client.listTools();
console.log('tools:', tools.map(t => t.name).join(', '));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const t = r.content[0].text;
  console.log(`\n--- ${name}${r.isError ? ' (ERROR)' : ''}\n` + (t.length > 900 ? t.slice(0, 900) + ' …' : t));
  if (r.isError) process.exitCode = 1;
  return t;
};
await call('rules_get');
await call('chart_get_bars', { symbol, timeframe: '5m', limit: 10 });
const L = JSON.parse(await call('chart_levels', { symbol }));
await call('chart_auto_mark', { symbol });
await call('chart_draw_level', { symbol, price: L.prior.high, label: 'Selftest level', kind: 'resistance' });
await call('chart_clear', { symbol, source: 'ai' });
await call('news_get', { symbols: [symbol] });
await client.close();
