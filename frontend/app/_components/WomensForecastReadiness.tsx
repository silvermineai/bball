"use client";

import { useEffect, useState } from "react";

type ReadinessCheck = {
  key: string;
  label: string;
  status: "ready" | "missing" | "blocked";
  detail: string;
  required: string;
};

type Readiness = {
  target_season: number;
  status: "published" | "ready_for_fit" | "blocked";
  model_id: string | null;
  baseline_model_id?: string;
  baseline_forecast_rows?: number;
  forecast_rows: number;
  model_boundary: string;
  checks: ReadinessCheck[];
  missing_inputs: Array<{ dataset: string; season: number; release_tag: string; asset: string }>;
  next_steps: string[];
};

const stateLabel: Record<ReadinessCheck["status"], string> = {
  ready: "Ready",
  missing: "Missing",
  blocked: "Blocked",
};

export default function WomensForecastReadiness() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  useEffect(() => {
    fetch("/data/basketball/womens-forecast-readiness.json")
      .then((response) => response.ok ? response.json() as Promise<Readiness> : null)
      .then(setReadiness)
      .catch(() => setReadiness(null));
  }, []);

  if (!readiness) return <p className="muted">Loading women&apos;s forecast readiness…</p>;
  const blocked = readiness.status === "blocked";
  const published = readiness.status === "published" && Boolean(readiness.model_id);
  return <section className="field-card" aria-labelledby="wbb-readiness-title">
    <div className="eyebrow">MODEL READINESS · {readiness.target_season}</div>
    <h3 id="wbb-readiness-title">{published ? "Women’s-only multi-season forecast is live." : blocked ? "Baseline forecast live; expanded fit still assembling." : "Inputs are ready for an expanded women’s-only fit."}</h3>
    <p>{readiness.model_boundary}</p>
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Gate</th><th>Status</th><th>What the gate requires</th></tr></thead>
        <tbody>{readiness.checks.map((check) => <tr key={check.key}>
          <td><strong>{check.label}</strong><small>{check.detail}</small></td>
          <td><span className={`readiness-state readiness-state-${check.status}`}>{stateLabel[check.status]}</span></td>
          <td>{check.required}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {blocked && <>
      <p className="note"><strong>{readiness.missing_inputs.length} retained historical assets are still required.</strong> The target schedule remains context only; it cannot train or calibrate a forecast.</p>
      <details>
        <summary>Show exact release assets to import</summary>
        <ul className="plain-list">{readiness.missing_inputs.map((input) => <li key={`${input.dataset}-${input.season}`}>{input.dataset === "schedule" ? "Women’s schedule" : "Women’s team box"} · {input.season} edition</li>)}</ul>
      </details>
      <details>
        <summary>Show the publication steps</summary>
        <ol className="plain-list">{readiness.next_steps.map((step) => <li key={step}>{step}</li>)}</ol>
      </details>
    </>}
    {readiness.model_id ? <p className="note">Published women’s model: <code>{readiness.model_id}</code> · {readiness.forecast_rows.toLocaleString()} upcoming forecasts. The validation gate remains attached to the edition.</p> : readiness.baseline_model_id ? <p className="note">Published baseline: <code>{readiness.baseline_model_id}</code> · {readiness.baseline_forecast_rows?.toLocaleString() || 0} upcoming forecasts. The gates above describe the next richer model edition.</p> : null}
  </section>;
}
