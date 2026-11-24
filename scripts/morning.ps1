# Morning routine for Windows: facts brief, then your AI writes the brief with your rules.
# Schedule it with: scripts\schedule-windows.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
node brief.js
if (Get-Command claude -ErrorAction SilentlyContinue) {
  claude -p "Use the alphaline tools. Read my rules (rules_get), today's facts brief (brief_get) and the news (news_get). For each watchlist symbol, mark the chart using my rules. Then save a short morning brief with brief_save: what matters today, the levels I care about, event times, and what would make me sit out. Education only, no predictions." --allowedTools "mcp__alphaline"
} elseif (Get-Command codex -ErrorAction SilentlyContinue) {
  codex exec "Use the alphaline MCP tools. Read rules_get, brief_get and news_get, mark each watchlist chart using my rules, then save a short morning brief with brief_save. Education only, no predictions."
} else {
  Write-Host "Facts brief written. Install Claude Code or Codex to add the AI brief."
}
