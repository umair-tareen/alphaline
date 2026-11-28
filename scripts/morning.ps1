# Morning routine for Windows: facts brief, then your AI writes the brief with your rules.
# Schedule it with: scripts\schedule-windows.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
node brief.js
# Nobody is watching this run and it reads news headlines, so it gets read and draw tools only: no rules_save,
# scanlist_set, journal_add, alert or indicator changes, and no clearing or removing drawings.
$tools = "mcp__alphaline__rules_get,mcp__alphaline__brief_get,mcp__alphaline__news_get,mcp__alphaline__chart_get_bars,mcp__alphaline__chart_levels,mcp__alphaline__chart_list_drawings,mcp__alphaline__chart_auto_mark,mcp__alphaline__chart_draw_level,mcp__alphaline__chart_draw_zone,mcp__alphaline__chart_add_note,mcp__alphaline__chart_focus,mcp__alphaline__scan_watchlist,mcp__alphaline__indicator_list,mcp__alphaline__data_sources,mcp__alphaline__brief_save"
if (Get-Command claude -ErrorAction SilentlyContinue) {
  claude -p "Use the alphaline tools. Read my rules (rules_get), today's facts brief (brief_get) and the news (news_get). For each watchlist symbol, mark the chart using my rules. Then save a short morning brief with brief_save: what matters today, the levels I care about, event times, and what would make me sit out. Education only, no predictions." --allowedTools $tools
} elseif (Get-Command codex -ErrorAction SilentlyContinue) {
  # Codex has no per-run tool list, so point its alphaline server at the --morning tool set for this run only.
  $node = (Get-Command node).Source; $mcp = Join-Path (Get-Location) 'mcp.js'
  codex exec -c "mcp_servers.alphaline.command='$node'" -c "mcp_servers.alphaline.args=['$mcp','--morning']" "Use the alphaline MCP tools. Read rules_get, brief_get and news_get, mark each watchlist chart using my rules, then save a short morning brief with brief_save. Education only, no predictions."
} else {
  Write-Host "Facts brief written. Install Claude Code or Codex to add the AI brief."
}
