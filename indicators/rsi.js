// Custom indicator example, and the template for your own.
// Ask your AI: "add a custom indicator that ..." and it writes a file like this one in indicators/,
// then turns it on with the indicator_set tool (type "custom", file "<name without .js>").
//
// compute(bars, params) gets candles oldest first: [{ time, open, high, low, close, volume }]
// and returns points [{ time, value }], or { lines: [{ label, color, points }] } for several lines.
// pane: 'price' draws on the candles, 'lower' draws in a strip under them. guides: horizontal lines.
export default {
  label: 'RSI',
  pane: 'lower',
  guides: [30, 70],
  compute(bars, { length = 14 } = {}) {
    const out = [];
    let gain = 0, loss = 0;
    for (let i = 1; i < bars.length; i++) {
      const ch = bars[i].close - bars[i - 1].close;
      const g = Math.max(ch, 0), l = Math.max(-ch, 0);
      if (i <= length) { gain += g / length; loss += l / length; }
      else { gain = (gain * (length - 1) + g) / length; loss = (loss * (length - 1) + l) / length; }
      // no gains and no losses (a flat series) is 50, not 100
      if (i >= length) out.push({ time: bars[i].time, value: loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss) });
    }
    return out;
  },
};
