"use client";

import { useMemo, useState } from "react";
import { projectScore, type ScoreProjectionInputs } from "../../_lib/score-projection";

type Field = "homeOffense" | "awayOffense" | "homeDefense" | "awayDefense" | "pace" | "homeCourt";
type FormState = Record<Field, string>;

const fields: Array<[Field, string, string]> = [
  ["homeOffense", "HOME ADJUSTED OFFENSE", "Points per 100 possessions"],
  ["awayOffense", "AWAY ADJUSTED OFFENSE", "Points per 100 possessions"],
  ["homeDefense", "HOME ADJUSTED DEFENSE", "Opponent points per 100 possessions"],
  ["awayDefense", "AWAY ADJUSTED DEFENSE", "Opponent points per 100 possessions"],
  ["pace", "EXPECTED PACE", "Possessions per 40 minutes"],
  ["homeCourt", "HOME COURT TERM", "Points per 100 possessions"],
];

const blank: FormState = {
  homeOffense: "",
  awayOffense: "",
  homeDefense: "",
  awayDefense: "",
  pace: "",
  homeCourt: "",
};

const sample: FormState = {
  homeOffense: "112",
  awayOffense: "108",
  homeDefense: "96",
  awayDefense: "101",
  pace: "70",
  homeCourt: "3",
};

const parse = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const number = (value: number | null, digits = 1) => value == null ? "—" : value.toFixed(digits);
const signed = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;

export default function ScoreProjectionCalculator() {
  const [form, setForm] = useState<FormState>(sample);
  const inputs = useMemo(() => {
    const parsed = Object.fromEntries(fields.map(([key]) => [key, parse(form[key])])) as ScoreProjectionInputs;
    return parsed;
  }, [form]);
  const result = useMemo(() => projectScore(inputs), [inputs]);
  const set = (key: Field, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <section className="paper-panel" aria-labelledby="score-projection-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Try it / Model mechanics</div>
          <h2 id="score-projection-title">Turn efficiency into a score.</h2>
        </div>
        <div className="button-row">
          <button className="button secondary" type="button" onClick={() => setForm(sample)}>Load sample</button>
          <button className="button secondary" type="button" onClick={() => setForm(blank)}>Clear</button>
        </div>
      </div>
      <p>
        This classroom worksheet averages each offense with the opponent&apos;s defense, applies an expected pace, and adds a home-court term. It mirrors the intuition behind an efficiency matchup while staying separate from Silvermine&apos;s fitted forecast.
      </p>
      <div className="toolbar">
        {fields.map(([key, label, hint]) => (
          <label className="control" key={key}>
            <span>{label}</span>
            <input name={`score-projection-${key}`} autoComplete="off" type="number" step="0.1" inputMode="decimal" value={form[key]} onChange={(event) => set(key, event.target.value)} />
            <small>{hint}</small>
          </label>
        ))}
      </div>
      <div className="raw-stat-grid" aria-live="polite">
        <div><dt>{number(result.homeScore)}</dt><dd>Home projected points</dd><small>{number(result.homeEfficiency)} points / 100 possessions</small></div>
        <div><dt>{number(result.awayScore)}</dt><dd>Away projected points</dd><small>{number(result.awayEfficiency)} points / 100 possessions</small></div>
        <div><dt>{signed(result.margin)}</dt><dd>Home projected margin</dd><small>Positive values favor the home team</small></div>
        <div><dt>{number(result.total)}</dt><dd>Projected total</dd><small>Home plus away points</small></div>
      </div>
      <p className="note">
        Formula: home efficiency = (home Adj O + away Adj D) / 2 + home-court term; away efficiency = (away Adj O + home Adj D) / 2; score = pace × efficiency / 100. Lower Adj D is better. Missing inputs keep the whole exercise unavailable, and the result does not change ratings, forecasts or the ledger.
      </p>
    </section>
  );
}
