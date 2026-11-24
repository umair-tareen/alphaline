# ATP Chart Desk

A free chart desk that runs on your own computer and that **your own Claude or Codex can draw on**.

- TradingView-style candlestick charts (TradingView Lightweight Charts™)
- Ask your AI "mark SPY using my rules" and it draws levels, gaps and zones on the chart while you watch
- Levels calculated by code, not guessed: prior day high/low/close, premarket high/low, opening gap, VWAP, ATR, unfilled fair value gaps, daily support and resistance zones
- A morning brief: today's US economic calendar, headlines and your levels, then your AI writes it up using your rules, on a schedule
- Your data stays in one folder (`data/`) you can back up or wipe
- Data from a free demo feed on day one, then Schwab (thinkorswim) or Alpaca. Webull users: see SETUP.md
- **Read-only.** There are no order tools. It helps you follow your process; it does not trade for you.

Made by Alpha Trading Pros. Education only, not financial advice. Trading involves risk.

## Quick start
You need [Node.js](https://nodejs.org) 18 or newer.

```
npm install
npm start
```
Open http://localhost:4321. Press **Mark levels** to see the calculated marks.

## Connect your AI
**Claude Code or Codex:** open a terminal in this folder and start `claude` (or `codex`). Claude Code picks up `.mcp.json` here automatically; for Codex see SETUP.md. Then try:
- "Mark SPY using my rules"
- "Write my morning brief"
- "Show me QQQ on the 15 minute and mark the gap"

**Claude Desktop:** see SETUP.md.

## Make it yours
Edit **my-rules.md**. It is what your AI reads before it marks anything: what you trade, the levels you care about, when you sit out. Building it around your own strategy is what we do together in the [Alpha Trading Pros intensive](https://alphatradingpros.com/cohort/).

## Files
| Path | What it is |
|---|---|
| `my-rules.md` | Your strategy rules, in plain words |
| `config.json` | Data source, watchlist, news sources |
| `config.local.json` | Your API keys (never shared, git ignores it) |
| `data/` | Cached prices, drawings, briefs, news. Delete it any time to start fresh |
| `mcp.js` | The tools your AI uses |
| `brief.js` | The morning facts brief (`npm run brief`) |

## Credits
Charts by [TradingView Lightweight Charts™](https://www.tradingview.com/) (Apache 2.0). See NOTICE.
