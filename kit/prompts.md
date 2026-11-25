# Prompts for your AI

Copy, paste, and fill in the [brackets]. Each one is used in the intensive.

## Tighten my rules
Here are my trading rules. For each one, tell me if a stranger could check it on a chart without guessing. If not, rewrite it so they could, using only price, moving averages, volume and time. Keep my intent. Don't add new rules. Then give me the whole list back, ready to paste into my-rules.md.
[paste your rules]

## Mark my chart
Read my rules with rules_get. Then mark today's key levels on [SPY] using only what my rules ask for. Use chart_levels for every price; never guess a number. Keep each label to 5 words or fewer.

## Run my scanner
Read my rules with rules_get, then run scan_watchlist. Score every symbol against each of my rules, show pass or fail per rule, and give me a top 5 ranked by how many rules pass. Use only the numbers the scan returns.

## Weekly journal review
Read my journal with journal_get. Using only that data: 1) name my top three leaks (overtrading, revenge trades, early exits, rule breaks), each with the rows that prove it; 2) total R, win rate, number of rule breaks, R lost on rule-break trades; 3) one specific rule or habit change for next week. Don't guess at anything not in the data.

## Check a trade before I take it
Run my checklist (kit/risk-checklist.md) on this idea: [symbol, long/short, entry, stop]. Use rules_get, news_get, journal_get and risk_size. If any answer is no, say BLOCKED and name the reason.

## Morning brief
Read rules_get, brief_get and news_get. Mark my watchlist charts using my rules, then save a morning brief with brief_save: what matters today, my levels, event times, and what would make me sit out. Facts only, no predictions.
