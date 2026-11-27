# Status

Read this first. Update it before every commit that changes status, and before ending a session.

Current as of: 2026-11-27, after PR #1 was merged into `main` (merge commit `bda0e22`).

## Now
- `main` holds the fixes from the 2026-11-27 review (PR #1, three commits: `0ee0d7f` review fixes, `048376e` CLI bridge `scripts/tool.js`, `d45bde9` 4:00 AM premarket via Alpaca).
- No open pull requests. No CI is set up on GitHub; checks are run by hand (see How to verify).
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
3. **Open question, not a confirmed bug:** `lib/levels.js` trims bad prints with `clipBadPrints(..., a * 0.5)`, where `a` is the daily ATR. A bar whose wick runs more than half an ATR past its neighbours is cut back. Check that a real 4:00 AM spike on an earnings or news gap isn't trimmed.
4. **Regression fixture:** save the 2026-11-27 SPY and AMZN bars and assert the known answers in `scripts/unit.js` (SPY low 719.61, gap not filled, AMZN premarket high 252.75, half-day close at 13:00), so the levels are checked without network or keys.
5. Commit `BUGS-2026-11-27.md` (or fold it into this file) so the list isn't on one machine only.

## Decisions
- The server answers only `localhost` / `127.0.0.1`, and every write needs the `X-Alphaline` header the page sends.
- AI-written indicator code is saved **off**; only the trader turns it on in the Indicators sheet.
- Keys and personal settings live in `config.local.json` (gitignored), never in a tracked file. `data/` and `*.log` are gitignored.
- Commits use the GitHub no-reply address for UAT.
- The desk is read-only on purpose: no order placement.

## How to verify
- `npm run test:unit`: calculation checks, no network or packages needed. Passed on `main` at `bda0e22` (2026-11-27).
- `npm test`: starts the MCP server and calls every tool once; needs `npm install` first. Reported passing on UAT's machine before the merge; not rerun since.
- Market data checks need the app running with a real source (`npm start`, then http://localhost:4321).
