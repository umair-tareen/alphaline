// Call one alphaline MCP tool from a shell, for AI agents without MCP (Pi, local LLMs).
// node scripts/tool.js list                      -> tool names
// node scripts/tool.js chart_levels '{"symbol":"AMZN"}'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const [name, args = '{}'] = process.argv.slice(2);
const c = new Client({ name: 'cli', version: '1' });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('../mcp.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')] }));
if (!name || name === 'list') console.log((await c.listTools()).tools.map(t => `${t.name}: ${t.description}`).join('\n'));
else console.log((await c.callTool({ name, arguments: JSON.parse(args) })).content.map(x => x.text).join('\n'));
await c.close();
