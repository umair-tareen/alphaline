# Indicator ideas

Things to build on Alphaline, roughly in order of how much data they need. Ask your AI to build any of them: "Read docs/indicator-ideas.md and build the anchored VWAP."

## Works with the candles you already have
- **Volume profile** (built in). Volume at each price for the candles on screen, with the most traded price and the value area.
- **Gaps and zones** (built in). Opening gaps, fast-move gaps (fair value gaps) and support and resistance areas.
- **Anchored VWAP.** VWAP starting from a candle you choose, like the open or a news spike.
- **Opening range.** The high and low of the first 5, 15 or 30 minutes, drawn for the rest of the day.
- **Relative volume.** Today's volume against the same time of day over the last 10 days.
- **Distance from VWAP or the 21 EMA**, in ATRs, so you can see when price is stretched.
- **Session shading.** Pre-market, regular hours and after hours in different backgrounds.
- **Inside and outside days**, marked on the daily chart.

## Needs trade-by-trade data (a "tick" feed)
Free candle feeds can't show these. They need each individual trade with its price, size and whether it hit the bid or the ask. Feeds that can provide this include Databento, Polygon (Massive), Rithmic and some broker APIs. A provider adds `getTrades()` (see `providers/_template.js`).
- **Footprint chart.** Each candle split into price rows showing how much traded at the bid and at the ask.
- **Delta and cumulative delta.** Buying volume minus selling volume, per candle and running through the day.
- **Volume profile from real trades**, more exact than the candle-based one.
- **Big trade bubbles.** Circles where unusually large single trades printed.

## Needs order book data (market depth, "Level 2")
- **Depth heatmap** (the Bookmap-style view). Resting buy and sell orders at each price, over time, as a heatmap behind the candles. A provider adds `getDepth()`.
- **Order book ladder.** The live list of bids and asks beside the chart.

Depth and tick data cost money from most vendors and arrive very fast. Plan for a paid feed and a faster machine before building these.
