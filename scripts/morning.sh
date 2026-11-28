#!/usr/bin/env bash
# Morning routine for Mac/Linux. Schedule with cron, e.g. 30 8 * * 1-5 (set your machine to New York time or adjust).
cd "$(dirname "$0")/.."
# cron starts with a bare PATH, so add the usual homes of node, claude and codex, and keep a log you can read.
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.claude/local:/opt/homebrew/bin:/usr/local/bin:$PATH"
mkdir -p data && exec >> data/morning.log 2>&1 && echo "== $(date)"
node brief.js
PROMPT="Use the alphaline tools. Read my rules (rules_get), today's facts brief (brief_get) and the news (news_get). For each watchlist symbol, mark the chart using my rules. Then save a short morning brief with brief_save: what matters today, the levels I care about, event times, and what would make me sit out. Education only, no predictions."
# Nobody is watching this run and it reads news headlines, so it gets read and draw tools only: no rules_save,
# scanlist_set, journal_add, alert or indicator changes, and no clearing or removing drawings.
TOOLS="mcp__alphaline__rules_get,mcp__alphaline__brief_get,mcp__alphaline__news_get,mcp__alphaline__chart_get_bars,mcp__alphaline__chart_levels,mcp__alphaline__chart_list_drawings,mcp__alphaline__chart_auto_mark,mcp__alphaline__chart_draw_level,mcp__alphaline__chart_draw_zone,mcp__alphaline__chart_add_note,mcp__alphaline__chart_focus,mcp__alphaline__scan_watchlist,mcp__alphaline__indicator_list,mcp__alphaline__data_sources,mcp__alphaline__brief_save"
if command -v claude >/dev/null; then claude -p "$PROMPT" --allowedTools "$TOOLS"
elif command -v codex >/dev/null; then codex exec "$PROMPT"
else echo "AI brief SKIPPED: neither claude nor codex was found on PATH ($PATH). Facts brief written."; fi
