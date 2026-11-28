# Status

Read this first. Update it before every commit that changes status, and before ending a session.

Current as of: 2026-11-28, on branch `claude/project-thread-furf4r` (fixes for the top 12 findings of the 2026-11-28 review, in a PR waiting for UAT's review).

## Now
- `main` holds the fixes from the 2026-11-27 review (PR #1, three commits: `0ee0d7f` review fixes, `048376e` CLI bridge `scripts/tool.js`, `d45bde9` 4:00 AM premarket via Alpaca).
- 2026-11-28 review: four reviewers read the whole repo and 28 issues were confirmed. The top 12 are fixed on `claude/project-thread-furf4r` (open PR, not merged). The other 16 are listed under Next.
- No CI is set up on GitHub; checks are run by hand (see How to verify).
- The review found 25 issues; 19 are fixed in PR #1. The rest are listed under Next.

## Waiting on UAT
- **Alpaca keys:** add them to `config.local.json` (or the `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY` environment variables). Without them, premarket levels still start at 7:00 on Schwab data.
- **Live check of the 4:00 AM premarket fix (`d45bde9`):** it was merged after offline tests only; the live check was blocked. With Alpaca keys set, restart and confirm `/api/levels?symbol=AMZN` for 2026-11-27 shows a premarket high of 252.75 (NVDA 156.99). Those reference numbers came from a separate script, not from Alphaline's own output (unconfirmed in Alphaline).
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
3a. **Open from the 2026-11-28 review (not fixed yet):**
   - `server.js:33` recursive `fs.watch` throws on Linux with Node 18; raise `engines` to `>=20` or guard it.
   - `scripts/tool.js:8` breaks when the folder path has a space (use `fileURLToPath`).
   - `lib/config.js` `loadConfig` falls back to defaults on a bad `config.json`, and the next save writes the defaults back.
   - `lib/levels.js` fast-move gaps are found across the overnight session boundary.
   - `lib/bars.js:51`, `lib/store.js:7`: BRK.B / BRK-B / BRK_B share one cache and drawings file.
   - Alerts: an empty price field saves 0 and an "above" alert rings at once; each chime opens a new AudioContext; two tabs both chime.
   - ATR is a plain 14-day mean, not Wilder's; `lib/scan.js` includes today's partial daily bar.
   - Scanner `volumeVsAvg` / `changePct` use the partial daily bar during the session.
   - `lib/news.js` keeps `javascript:` links from feeds (only `https?://` should be kept).
   - `lib/journal.js` cells starting with `= + - @` run as formulas in Excel.
   - `server.js`: drawings body can set `id`/`created`/`status`; `/api/run` spawn has no error handler; oversized bodies keep buffering; bad JSON returns 500.
   - `lib/time.js` `parseTime` reads `HH:MM:SS` without a zone in the machine's time (affects AI note/zone anchors only).
   - In-progress drawings: saved to the next symbol after a switch, and wiped by any drawings update.
   - `indicators/rsi.js` reads 100 on a flat series.
   - Journal form's default date is the UTC date after evening hours.
   - Read-modify-write saves (drawings, alerts, indicators) from the web page and the MCP server at the same moment can still lose one change (the temp-file crash is fixed).
   - `scripts/morning.sh` / `morning.ps1`: the Codex branch still runs with every alphaline tool; only the Claude branch is limited.
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
- `npm run test:unit`: calculation checks, no network or packages needed. Passed on `claude/project-thread-furf4r` (2026-11-28).
- `npm test`: starts the MCP server and calls every tool once; needs `npm install` first and live data. Reported passing on UAT's machine before PR #1; not run on the 2026-11-28 branch (packages not installed in that session). Run it before merging.
- Market data checks need the app running with a real source (`npm start`, then http://localhost:4321).
