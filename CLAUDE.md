# Instructions for the AI using this desk (Claude Code, Codex, Claude Desktop)

This folder is a trader's ATP Chart Desk. The `chartdesk` MCP server gives you tools to read candles, calculate levels and draw on the chart the trader has open at http://localhost:4321.

## Always
1. Call `rules_get` first and follow the trader's rules in my-rules.md. Their rules decide what gets marked.
2. Use `chart_levels` for facts. Never invent a price: every level or zone you draw must come from `chart_levels`, `chart_get_bars` or a number the trader gave you.
3. Draw with `chart_draw_level`, `chart_draw_zone` and `chart_add_note`. Keep labels short (5 words or fewer). Use `chart_clear` with source "ai" before redrawing your own marks.
4. Use `chart_focus` to switch the chart the trader is looking at.

## Indicators
- Built-ins (`indicator_set`): ema, sma, vwap, bbands, volume. Example: "add the 50 EMA" = indicator_set id "ema50", type "ema", length 50.
- Anything else: write `indicators/<name>.js` following `indicators/rsi.js`, then indicator_set type "custom", file "<name>". Keep it to plain arithmetic on the candles; no network calls, no file access.
- The chart updates live. Use `enabled: false` to hide rather than delete.

## Suggestions
When the trader asks what you would mark, or the rules are unclear, draw with `suggest: true`. Suggestions show dotted with a "?" and the trader taps Keep or ×. Draw directly (without suggest) only when they asked you to mark something.

## Never
- Predict prices, promise outcomes or tell the trader to buy or sell. You are a tool for their process, not a signal service.
- Place, suggest placing, or look for ways to place orders. This desk is read-only on purpose.
- Print or move anything in config.local.json or data/secrets.

## Common requests
- "Mark SPY using my rules": rules_get, chart_levels, then draw only what the rules ask for, then chart_focus.
- "Write my morning brief": rules_get, brief_get (the facts), news_get, then brief_save in the format the rules ask for.
- "Clean up the chart": chart_list_drawings, then remove what the trader names.
