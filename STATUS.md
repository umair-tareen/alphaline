# Status

Read this first. Update it before every commit that changes status, and before ending a session.

Current as of: 2026-11-28, on branch `fix/review-2026-11-28-rest` (the 17 remaining findings of the 2026-11-28 review, in a PR waiting for UAT's review).

## Now
- `main` holds the fixes from the 2026-11-27 review (PR #1, three commits: `0ee0d7f` review fixes, `048376e` CLI bridge `scripts/tool.js`, `d45bde9` 4:00 AM premarket via Alpaca).
- 2026-11-28 review: four reviewers read the whole repo and 28 issues were confirmed. The top 12 are on `main` (PR #3). The other 16, plus the Codex morning-run item, are fixed on `fix/review-2026-11-28-rest` (see "Fixed on this branch").
- No CI is set up on GitHub; checks are run by hand (see How to verify).
- The review found 25 issues; 19 are fixed in PR #1. The rest are listed under Next.

## Waiting on UAT
- **Alpaca keys:** set on UAT's machine (2026-11-28). The 4:00 AM premarket fix is confirmed live: `/api/levels` showed AMZN 252.75 and SPY 731.49 from 04:00.
- **Remote use:** Tailscale / phone access is now refused by design. Decide whether to add a login token before reopening it.

## Next
1. **Market-hours checks (Monday):** live bar updates, the 30-second refresh, alerts firing and ringing, Schwab token refresh. None of these has been tested during market hours yet.
2. **Known issues not fixed in PR #1** (from the PR description; the full list is in `BUGS-2026-11-27.md`, which is untracked and only on UAT's machine, so this list may be incomplete):
   - The chart still draws the raw bad-print wick; only the levels ignore it.
   - A swing zone that straddles the price is labelled "support".
   - Error text from a provider is still shown on the page.
   - `scripts/schedule-windows.ps1` doesn't warn about the PC's time zone.
   - On half days, "volume vs average" reads low.
   - zod advisory: the fix is zod 4, a breaking change.
3. **Bad-print clipping (answered 2026-11-28):** yes, a real one-bar spike more than half a daily ATR past both neighbours is trimmed, and the first and last bar of a series never are. The trimming is now reported in `chart_levels` as `clipped`, so the AI can flag it; the rule itself is unchanged. A smarter rule (volume, bar size) is still open.
3a. **Fixed on this branch (2026-11-28 review, the remaining 17):**
   - File watcher: falls back to watching `data/`, `data/drawings` and `data/briefs` where recursive `fs.watch` is missing (Linux before Node 20); lock files are ignored.
   - `scripts/tool.js`, `demo-markup.js`, `try-indicator.js` use `fileURLToPath`, so a folder path with spaces works (tested).
   - `loadConfig` throws a clear error on a broken `config.json` instead of returning defaults that the next save would write back (tested).
   - Fast-move gaps need all three candles on the same day, so no gap is found across the overnight break.
   - Symbols become file names with each non-alphanumeric character encoded (`fileSafe`), so BRK.B, BRK-B and BRK_B keep separate caches and drawings. Old drawing files for symbols with `.`, `-` or `^` are no longer read.
   - Alerts: a blank or zero price is refused (400, also via MCP); one AudioContext for all chimes; only the tab whose request triggered the alert rings (`first` in the trigger reply).
   - ATR is Wilder's. The scanner uses finished days for ATR and, while the session is open, compares volume at the same point of an average day (`partialDay`, `volumeVsAvg` is paced). `changePct` stays "so far today".
   - News links that aren't `http(s)://` are dropped.
   - Journal cells starting with `= + - @` get a leading `'` (numbers such as -1.5 are left alone; the `'` is removed on read).
   - Server: page drawings can't set `id`/`created`/`status`/`source`; `/api/run` reports a failed start; a body over 200 KB gets 413 and the rest is dropped unread; bad JSON is 400.
   - `parseTime` reads `HH:MM:SS` as New York time.
   - Unfinished drawings live in their own group (a drawings update no longer wipes them), are saved to the symbol they were started on, and are dropped on a symbol switch or tool change.
   - RSI on a flat series is 50.
   - Journal form's default date is today in New York.
   - Saves to drawings, alerts, indicators and `config.json` take a cross-process lock (`withLock`): 3 processes × 200 concurrent drawing saves kept all 600 (tested).
   - Morning run: `mcp.js --morning` registers only the 15 read and draw tools; the Codex branch of `morning.sh` / `morning.ps1` starts it that way through `codex exec -c` overrides.
4. **Regression fixture:** save the 2026-11-27 SPY and AMZN bars and assert the known answers in `scripts/unit.js` (SPY low 719.61, gap not filled, AMZN premarket high 252.75, half-day close at 13:00), so the levels are checked without network or keys.
5. Commit `BUGS-2026-11-27.md` (or fold it into this file) so the list isn't on one machine only.

## Decisions
- The server answers only `localhost` / `127.0.0.1`, and every write needs the `X-Alphaline` header the page sends.
- AI-written indicator code is saved **off**; only the trader turns it on in the Indicators sheet.
- Keys and personal settings live in `config.local.json` (gitignored), never in a tracked file. `data/` and `*.log` are gitignored.
- Commits use the GitHub no-reply address for UAT.
- The desk is read-only on purpose: no order placement.
- `risk_size` never returns more shares than the account can buy, and infers the side from the stop when it isn't given.
- Custom indicator code runs in a worker that is stopped after 5 seconds. That is not a sandbox: the trader is shown the code before turning it on, and `indicator_write` saves it off.
- The unattended morning run (Claude) gets read and draw tools only.

## How to verify
- `npm run test:unit`: calculation checks, no network needed. Also checks the save lock (4 processes x 100 locked saves all land; stale and failed locks are cleared) and the morning run (the Claude lists in `morning.sh` / `morning.ps1` match `mcp.js --morning`, no write tool is in it, both Codex branches pass `--morning`, and any new tool must be put in or left out on purpose). Passed on `fix/review-2026-11-28-rest` (2026-11-28).
- `npm test`: starts the MCP server and calls every tool once; needs `npm install` first and live data. Passed on UAT's machine for PR #3 and for `fix/review-2026-11-28-rest` (2026-11-28, Schwab data).
- Market data checks need the app running with a real source (`npm start`, then http://localhost:4321).
