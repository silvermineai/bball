"use client";

import { useState } from "react";

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function impliedAmerican(value: number) {
  if (value >= 100) return 100 / (value + 100);
  if (value <= -100) return Math.abs(value) / (Math.abs(value) + 100);
  return null;
}

function signedPoints(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

export default function ManualMarketCheck({
  homeName,
  modelMargin,
  modelTotal,
  modelHomeWinProbability,
}: {
  homeName: string;
  modelMargin: number;
  modelTotal: number;
  modelHomeWinProbability: number;
}) {
  const [spread, setSpread] = useState("");
  const [total, setTotal] = useState("");
  const [moneyline, setMoneyline] = useState("");
  const marketSpread = numberValue(spread);
  const marketTotal = numberValue(total);
  const marketMoneyline = numberValue(moneyline);
  const spreadEdge =
    marketSpread == null ? null : modelMargin + marketSpread;
  const totalEdge = marketTotal == null ? null : modelTotal - marketTotal;
  const implied =
    marketMoneyline == null ? null : impliedAmerican(marketMoneyline);
  const moneylineEdge =
    implied == null ? null : modelHomeWinProbability - implied;

  return (
    <section className="section paper-panel manual-market-check screen-only">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Reader tool / Manual quote check</div>
          <h2>Compare a line you observed.</h2>
        </div>
        <span className="note">Browser only · never published</span>
      </div>
      <p className="note">
        Enter a home spread, game total or {homeName} moneyline from a source
        you are reviewing. Results use the published forecast and stay in this
        browser; they are not a verified market observation, recommendation or
        ledger record.
      </p>
      <div className="manual-market-controls">
        <label className="control">
          <span>HOME SPREAD</span>
          <input
            inputMode="decimal"
            type="number"
            step="0.5"
            value={spread}
            onChange={(event) => setSpread(event.target.value)}
            placeholder="-3.5"
          />
          <small>Negative means {homeName} is favored.</small>
        </label>
        <label className="control">
          <span>GAME TOTAL</span>
          <input
            inputMode="decimal"
            type="number"
            step="0.5"
            value={total}
            onChange={(event) => setTotal(event.target.value)}
            placeholder="145.5"
          />
          <small>Use the full-game over/under number.</small>
        </label>
        <label className="control">
          <span>{homeName.toUpperCase()} MONEYLINE</span>
          <input
            inputMode="numeric"
            type="number"
            step="1"
            value={moneyline}
            onChange={(event) => setMoneyline(event.target.value)}
            placeholder="+125"
          />
          <small>American odds, at least +100 or at most -100.</small>
        </label>
      </div>
      <div className="manual-market-results" aria-live="polite">
        <div>
          <span>Spread edge</span>
          <strong>{spreadEdge == null ? "—" : signedPoints(spreadEdge)}</strong>
          <small>
            {spreadEdge == null
              ? "Model margin minus the observed home line."
              : spreadEdge > 0
                ? "Model is more favorable to the home side."
                : "Observed line is more favorable to the home side."}
          </small>
        </div>
        <div>
          <span>Total edge</span>
          <strong>{totalEdge == null ? "—" : signedPoints(totalEdge)}</strong>
          <small>
            {totalEdge == null
              ? "Model total minus the observed total."
              : totalEdge > 0
                ? "Model total is above the observed number."
                : "Model total is below the observed number."}
          </small>
        </div>
        <div>
          <span>Moneyline probability edge</span>
          <strong>
            {moneylineEdge == null
              ? "—"
              : `${moneylineEdge > 0 ? "+" : ""}${(moneylineEdge * 100).toFixed(1)} pp`}
          </strong>
          <small>
            {implied == null
              ? "Model home win probability is shown above."
              : `Implied ${ (implied * 100).toFixed(1) }% · model ${(modelHomeWinProbability * 100).toFixed(1)}%`}
          </small>
        </div>
      </div>
      <p className="note manual-market-footnote">
        Convention: spread edge = model home margin + home spread; total edge
        = model total − observed total. This arithmetic does not account for
        vig, pushes, limits, timing or player availability.
      </p>
    </section>
  );
}
