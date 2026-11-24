# Setup

## 1. Data
Set `"provider"` in config.json, then restart `npm start`.

| Provider | Cost | Setup |
|---|---|---|
| `demo` | Free | None. Delayed data from Yahoo's public chart endpoint, which is unofficial: good for learning, can change without notice. |
| `alpaca` | Free account | Sign up at alpaca.markets, create API keys (paper account is fine), add them to config.local.json. Uses the free IEX feed. |
| `schwab` | Free for Schwab clients | thinkorswim accounts. Register an app at developer.schwab.com (choose Market Data Production; callback URL `https://127.0.0.1`). Approval can take several days, so apply early. Add the app key and secret to config.local.json, then run `npm run schwab-login`. Schwab asks you to log in again every 7 days. |

Copy `config.local.example.json` to `config.local.json` and fill in only the provider you use.

**Webull:** Webull publishes its own official MCP server (`webull-openapi-mcp`, run with `uvx webull-openapi-mcp serve`). Add it next to the desk so your AI can read Webull quotes and your account, and set `WEBULL_TOOLSETS=account,market-data` to keep it read-only. It needs a Webull OpenAPI key and an OpenAPI market data subscription. A Webull chart feed for the desk itself is planned.

## 2. Your AI
**Claude Code:** run `claude` in this folder. `.mcp.json` registers the `chartdesk` tools; approve them when asked.

**Codex:** add to `~/.codex/config.toml` (use your real path):
```toml
[mcp_servers.chartdesk]
command = "node"
args = ["C:/path/to/atp-chart-desk/mcp.js"]
```

**Claude Desktop:** Settings > Developer > Edit Config, then add (use your real path):
```json
{ "mcpServers": { "chartdesk": { "command": "node", "args": ["C:/path/to/atp-chart-desk/mcp.js"] } } }
```

Check it works: `npm test` calls every tool once.

## 3. Morning brief on a schedule
`npm run brief` writes the facts (calendar, levels, headlines). `scripts/morning.ps1` (Windows) or `scripts/morning.sh` (Mac/Linux) runs that, then asks Claude Code or Codex to write your brief with your rules.

- Windows: in PowerShell in this folder, run `scripts/schedule-windows.ps1` once. It runs weekdays at 8:30 AM by this PC's clock.
- Mac/Linux: `crontab -e` and add `30 8 * * 1-5 /path/to/atp-chart-desk/scripts/morning.sh` (adjust for your time zone).

News sources and the calendar are in config.json under `news`. Change or remove any of them.

## 4. Your data
Everything lives in `data/`: `bars/` (price cache), `drawings/` (one file per symbol), `briefs/`, `news/`, `secrets/` (Schwab login). Back it up by copying the folder; wipe it by deleting it.
