// Toggle an indicator through the MCP tools, the way your AI would. Usage: node scripts/try-indicator.js rsi14 on|off
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';  // decodes spaces and drive letters in the folder path
const [id = 'rsi14', state = 'on'] = process.argv.slice(2);
const c = new Client({ name: 'try', version: '1' });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../mcp.js', import.meta.url))] }));
const r = await c.callTool({ name: 'indicator_set', arguments: { id, enabled: state === 'on' } });
console.log(r.content[0].text);
await c.close();
