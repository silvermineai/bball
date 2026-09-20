"use client";

import { useEffect, useState } from "react";

type Division = { status: string; rows: number; reason: string };
type Signal = { game_id: string; date?: string | null; home?: string | null; away?: string | null; source_flag: string };
type Readiness = {
  generated_at: string;
  published: { division: string; player_rows: number; team_rows: number; upcoming_games: number };
  divisions: Record<string, Division>;
  non_division_one_schedule_signals: { rows: number; classification: string; note: string; games: Signal[] };
  import_contract: { acceptance_rules: string[]; next_required_inputs: string[] };
};

const date = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : parsed.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function WomensDivisionReadiness({ division }: { division: "2" | "3" }) {
  const [publication, setPublication] = useState<Readiness | null>(null);
  useEffect(() => {
    fetch("/data/basketball/womens-division-readiness.json")
      .then((response) => response.ok ? response.json() : null)
      .then((value: Readiness | null) => setPublication(value))
      .catch(() => setPublication(null));
  }, []);
  const current = publication?.divisions[division];
  const signals = publication?.non_division_one_schedule_signals;
  return <section className="field-card" aria-labelledby="wbb-division-readiness-title">
    <div className="eyebrow">WOMEN&apos;S DIVISION INTAKE · D{division}</div>
    <h2 id="wbb-division-readiness-title">Division {division} readiness</h2>
    {!publication || !current ? <p className="muted">Loading the women&apos;s division evidence ledger…</p> : <>
      <p className="muted">{current.reason} The boundary is explicit so D1 production, rankings, and forecasts cannot leak into this scope.</p>
      <div className="scope-snapshot-counts"><strong>0</strong><span>D{division} rows</span><strong>{publication.published.player_rows.toLocaleString()}</strong><span>D1 players published</span><strong>{publication.published.team_rows.toLocaleString()}</strong><span>D1 team rows published</span></div>
      {signals ? <div className="paper-panel" style={{ marginTop: 18 }}>
        <div className="eyebrow">SOURCE SIGNAL · NOT A DIVISION LABEL</div>
        <h3>{signals.rows.toLocaleString()} scheduled non-Division-I signal{signals.rows === 1 ? "" : "s"}</h3>
        <p className="note">{signals.note}</p>
        {signals.games.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Away</th><th>Home</th><th>Source field</th></tr></thead><tbody>{signals.games.map((game) => <tr key={game.game_id}><td>{date(game.date)}</td><td>{game.away || "—"}</td><td>{game.home || "—"}</td><td><code>{game.source_flag}</code></td></tr>)}</tbody></table></div> : null}
      </div> : null}
      <details className="paper-panel" style={{ marginTop: 18 }}><summary><strong>What is required before publishing D{division}</strong></summary><ul>{publication.import_contract.next_required_inputs.map((item) => <li key={item}>{item}</li>)}</ul><p className="note">The importer also requires explicit division labels, stable identities, receipt hashes, and conflict rejection.</p></details>
      <p className="muted">Readiness ledger captured {date(publication.generated_at)}. Values are source evidence; no D{division} rows are inferred.</p>
    </>}
  </section>;
}
