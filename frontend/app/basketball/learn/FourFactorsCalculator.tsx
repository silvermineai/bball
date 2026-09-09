"use client";

import { useMemo, useState } from "react";
import {
  calculateFourFactors,
  type FourFactorInputs,
} from "../../_lib/four-factors";

type Field = keyof FourFactorInputs;
type FormState = Record<Field, string>;

const fields: Array<[Field, string]> = [
  ["fieldGoalsMade", "Field goals made"],
  ["threePointersMade", "Three pointers made"],
  ["fieldGoalsAttempted", "Field goals attempted"],
  ["turnovers", "Turnovers"],
  ["offensiveRebounds", "Offensive rebounds"],
  ["opponentDefensiveRebounds", "Opponent defensive rebounds"],
  ["freeThrowsAttempted", "Free throws attempted"],
];

const blank: FormState = {
  fieldGoalsMade: "",
  threePointersMade: "",
  fieldGoalsAttempted: "",
  turnovers: "",
  offensiveRebounds: "",
  opponentDefensiveRebounds: "",
  freeThrowsAttempted: "",
};

const sample: FormState = {
  fieldGoalsMade: "30",
  threePointersMade: "8",
  fieldGoalsAttempted: "60",
  turnovers: "12",
  offensiveRebounds: "10",
  opponentDefensiveRebounds: "24",
  freeThrowsAttempted: "18",
};

const parse = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const percent = (value: number | null) =>
  value == null ? "—" : `${(value * 100).toFixed(1)}%`;

export default function FourFactorsCalculator() {
  const [form, setForm] = useState<FormState>(blank);
  const inputs = useMemo(
    () => Object.fromEntries(fields.map(([key]) => [key, parse(form[key])])) as FourFactorInputs,
    [form],
  );
  const result = useMemo(() => calculateFourFactors(inputs), [inputs]);
  const set = (key: Field, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <section className="paper-panel" aria-label="Four Factors calculator">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Try it / Four Factors</div>
          <h2>Turn a box score into a question.</h2>
        </div>
        <div className="button-row">
          <button className="button secondary" type="button" onClick={() => setForm(sample)}>Load sample</button>
          <button className="button secondary" type="button" onClick={() => setForm(blank)}>Clear</button>
        </div>
      </div>
      <p className="note">
        Enter nonnegative team counts. The calculator stays in this browser;
        it does not change Silvermine ratings, forecasts or saved research.
      </p>
      <div className="toolbar">
        {fields.map(([key, label]) => (
          <label className="control" key={key}>
            <span>{label}</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={form[key]}
              onChange={(event) => set(key, event.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="raw-stat-grid" aria-live="polite">
        <div><dt>eFG%</dt><dd>{percent(result.effectiveFieldGoal)}</dd><small>(FGM + 0.5 × 3PM) / FGA</small></div>
        <div><dt>Turnover rate</dt><dd>{percent(result.turnoverRate)}</dd><small>TOV / estimated possessions</small></div>
        <div><dt>ORB%</dt><dd>{percent(result.offensiveReboundRate)}</dd><small>ORB / (ORB + opponent DRB)</small></div>
        <div><dt>FT rate</dt><dd>{percent(result.freeThrowRate)}</dd><small>FTA / FGA</small></div>
        <div><dt>Estimated possessions</dt><dd>{result.estimatedPossessions == null ? "—" : result.estimatedPossessions.toFixed(1)}</dd><small>FGA + 0.475 × FTA − ORB + TOV</small></div>
      </div>
      <p className="note">
        Missing inputs keep the affected rate unavailable instead of treating a
        blank as zero. Lower turnover rate is better; higher eFG%, ORB% and FT
        rate can be useful only after checking volume and opponent context.
      </p>
    </section>
  );
}
