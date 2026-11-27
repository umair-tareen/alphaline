#!/usr/bin/env bash
# Morning routine for Mac/Linux. Schedule with cron, e.g. 30 8 * * 1-5 (set your machine to New York time or adjust).
cd "$(dirname "$0")/.."
# cron starts with a bare PATH, so add the usual homes of node, claude and codex, and keep a log you can read.
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.claude/local:/opt/homebrew/bin:/usr/local/bin:$PATH"
mkdir -p data && exec >> data/morning.log 2>&1 && echo "== $(date)"
node brief.js
PROMPT="Use the alphaline tools. Read my rules (rules_get), today's facts brief (brief_get) and the news (news_get). For each watchlist symbol, mark the chart using my rules. Then save a short morning brief with brief_save: what matters today, the levels I care about, event times, and what would make me sit out. Education only, no predictions."
if command -v claude >/dev/null; then claude -p "$PROMPT" --allowedTools "mcp__alphaline"
elif command -v codex >/dev/null; then codex exec "$PROMPT"
else echo "AI brief SKIPPED: neither claude nor codex was found on PATH ($PATH). Facts brief written."; fi
