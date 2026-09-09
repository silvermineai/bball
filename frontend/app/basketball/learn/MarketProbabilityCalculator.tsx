"use client";

import { useMemo, useState } from "react";
import {
  americanOddsToImplied,
  expectedValuePerUnit,
  noVigProbability,
  overround,
} from "../../_lib/implied-probability";
import { spreadCoverProbability } from "../../_lib/market-probabilities";

const parse = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const percent = (value: number | null) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
const signedPercent = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

export default function MarketProbabilityCalculator() {
  const [model, setModel] = useState("55");
  const [odds, setOdds] = useState("-110");
  const [opposingOdds, setOpposingOdds] = useState("-110");
  const [margin, setMargin] = useState("3");
  const [marginLow, setMarginLow] = useState("-7");
  const [marginHigh, setMarginHigh] = useState("13");
  const [spread, setSpread] = useState("-3");
  const values = useMemo(() => {
    const modelProbability = parse(model);
    const modelFraction = modelProbability == null ? null : modelProbability / 100;
    const price = parse(odds);
    const opposite = parse(opposingOdds);
    const implied = americanOddsToImplied(price);
    const noVig = noVigProbability(price, opposite);
    return {
      implied,
      noVig,
      overround: overround(price, opposite),
      edge: modelFraction == null || noVig == null ? null : modelFraction - noVig,
      ev: modelFraction == null ? null : expectedValuePerUnit(modelFraction, price),
      cover: spreadCoverProbability(parse(margin) ?? Number.NaN, parse(marginLow), parse(marginHigh), parse(spread)),
    };
  }, [margin, marginHigh, marginLow, model, odds, opposingOdds, spread]);
  return (
    <section className="paper-panel" aria-labelledby="market-probability-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Interactive market lesson</div>
          <h2 id="market-probability-title">Translate a price into a probability.</h2>
        </div>
        <span className="note">Browser only · no wager or source claim</span>
      </div>
      <p>
        A model probability and a market price answer different questions. Use this worksheet to see the raw implied probability, the two-way no-vig estimate and the gap between them before comparing a forecast with a quote.
      </p>
      <div className="manual-market-controls recruiting-workload-controls">
        <label className="control">
          <span>MODEL PROBABILITY (%)</span>
          <input type="number" min="0" max="100" step="0.1" inputMode="decimal" value={model} onChange={(event) => setModel(event.target.value)} />
          <small>Use a calibrated win or cover probability.</small>
        </label>
        <label className="control">
          <span>PRICE (AMERICAN ODDS)</span>
          <input type="number" step="1" inputMode="numeric" value={odds} onChange={(event) => setOdds(event.target.value)} />
          <small>For example, −110 or +150.</small>
        </label>
        <label className="control">
          <span>OPPOSING PRICE</span>
          <input type="number" step="1" inputMode="numeric" value={opposingOdds} onChange={(event) => setOpposingOdds(event.target.value)} />
          <small>Needed to remove the two-way overround.</small>
        </label>
      </div>
      <div className="raw-stat-grid recruiting-workload-results" aria-live="polite">
        <div><dt>{percent(values.implied)}</dt><dd>Raw implied probability</dd><small>Price alone, including the book margin</small></div>
        <div><dt>{percent(values.noVig)}</dt><dd>No-vig probability</dd><small>Two prices normalized to 100%</small></div>
        <div><dt>{signedPercent(values.edge)}</dt><dd>Model edge</dd><small>Model probability minus no-vig price</small></div>
        <div><dt>{signedPercent(values.overround)}</dt><dd>Two-way overround</dd><small>Implied probabilities minus 100%</small></div>
        <div><dt>{values.ev == null ? "—" : `${values.ev >= 0 ? "+" : ""}${(values.ev * 100).toFixed(1)}%`}</dt><dd>Expected return</dd><small>Per unit staked under the model assumption</small></div>
      </div>
      <div className="section-heading" style={{ marginTop: 28, marginBottom: 10 }}>
        <div>
          <div className="eyebrow">Margin interval exercise</div>
          <h3>See how uncertainty changes a spread probability.</h3>
        </div>
      </div>
      <div className="manual-market-controls recruiting-workload-controls">
        <label className="control">
          <span>MODEL MARGIN</span>
          <input type="number" step="0.1" inputMode="decimal" value={margin} onChange={(event) => setMargin(event.target.value)} />
          <small>Home margin; positive favors the home team.</small>
        </label>
        <label className="control">
          <span>INTERVAL LOW</span>
          <input type="number" step="0.1" inputMode="decimal" value={marginLow} onChange={(event) => setMarginLow(event.target.value)} />
        </label>
        <label className="control">
          <span>INTERVAL HIGH</span>
          <input type="number" step="0.1" inputMode="decimal" value={marginHigh} onChange={(event) => setMarginHigh(event.target.value)} />
        </label>
        <label className="control">
          <span>HOME SPREAD</span>
          <input type="number" step="0.1" inputMode="decimal" value={spread} onChange={(event) => setSpread(event.target.value)} />
          <small>American-style line; −3 means home −3.</small>
        </label>
      </div>
      <div className="raw-stat-grid recruiting-workload-results" aria-live="polite">
        <div><dt>{percent(values.cover)}</dt><dd>Estimated home cover probability</dd><small>Normal approximation from the published 80% margin interval</small></div>
      </div>
      <p className="note">
        This is arithmetic for learning and auditability. It assumes a two-way market, ignores pushes and market limits, and does not establish that a model is calibrated or that a quote is current. The cover exercise uses a normal approximation to the symmetric nominal 80% interval and should be read with that limitation. Silvermine keeps missing or unlicensed market observations unavailable.
      </p>
    </section>
  );
}
