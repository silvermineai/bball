"use client";

import { useEffect, useState } from "react";
import DivisionCoverageMatrix from "./DivisionCoverageMatrix";
import { divisionPlayerReadiness } from "../_lib/division-player-readiness";

type Division = { status: string; rows: number; reason: string };
type Signal = { game_id: string; date?: string | null; home?: string | null; away?: string | null; source_flag: string };
type RetainedAsset = {
  asset: string;
  dataset?: string | null;
  season?: number | string | null;
  rows: number;
  columns?: number;
  division_fields: string[];
  identity_fields?: string[];
  non_d1_signal_fields?: string[];
  receipt: { valid: boolean; sha256?: string | null };
  scope_status?: string;
};
type Readiness = {
  generated_at: string;
  published: { division: string; player_rows: number; team_rows: number; upcoming_games: number };
  divisions: Record<string, Division>;
  non_division_one_schedule_signals: { rows: number; classification: string; note: string; games: Signal[] };
  asset_audit?: { status: string; assets_inspected: number; assets_with_explicit_division: number; assets_with_valid_receipt: number; explicit_division_fields: string[]; method: string };
  retained_assets?: RetainedAsset[];
  import_contract: { acceptance_rules: string[]; next_required_inputs: string[]; required_scope_fields?: string[]; required_identity_fields?: string[]; required_receipt_fields?: string[]; accepted_division_values?: Array<number | string> };
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
      <DivisionCoverageMatrix sport="basketball" gender="women" division={division} />
      <div className="scope-snapshot-counts"><strong>0</strong><span>D{division} rows</span><strong>{publication.published.player_rows.toLocaleString()}</strong><span>D1 players published</span><strong>{publication.published.team_rows.toLocaleString()}</strong><span>D1 team rows published</span></div>
      {publication.asset_audit && publication.retained_assets?.length ? <div className="paper-panel" style={{ marginTop: 18 }}>
        <div className="eyebrow">RETAINED ASSET AUDIT</div>
        <h3>{publication.asset_audit.assets_inspected.toLocaleString()} files inspected · {publication.asset_audit.assets_with_explicit_division.toLocaleString()} explicit division labels</h3>
        <p className="note">{publication.asset_audit.method} {publication.asset_audit.assets_with_valid_receipt.toLocaleString()} files have a valid source receipt.</p>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Retained asset</th><th className="numeric">Rows</th><th>Division field</th><th>Identity fields</th><th>Receipt</th></tr></thead><tbody>{publication.retained_assets.map((asset) => <tr key={asset.asset}><th scope="row">{asset.asset}<small>{asset.dataset || "source file"}{asset.season ? ` · ${asset.season}` : ""}</small></th><td className="numeric">{asset.rows.toLocaleString()}</td><td>{asset.division_fields.length ? asset.division_fields.join(", ") : <span className="status-error">none</span>}</td><td>{asset.identity_fields?.length ? asset.identity_fields.join(", ") : "—"}</td><td>{asset.receipt.valid ? "valid" : <span className="status-error">missing / invalid</span>}</td></tr>)}</tbody></table></div>
      </div> : null}
      {publication.retained_assets?.length ? (() => {
        const playerReadiness = divisionPlayerReadiness(publication.retained_assets);
        return <div className="paper-panel" style={{ marginTop: 18 }} aria-label="Women&apos;s lower-division player import readiness">
          <div className="eyebrow">PLAYER IMPORT GATE</div>
          <h3>{playerReadiness.ready}/{playerReadiness.candidates} candidate player assets ready</h3>
          <p className="note">A player release is eligible for D{division} ingestion only when it carries an explicit division field, stable team and athlete identifiers, and a valid receipt. Current source assets remain blocked when any requirement is absent.</p>
          {playerReadiness.candidates ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Candidate asset</th><th className="numeric">Rows</th><th>Status</th><th>Gate detail</th></tr></thead><tbody>{playerReadiness.gates.map((gate) => <tr key={gate.asset}><th scope="row">{gate.asset}<small>{gate.dataset}</small></th><td className="numeric">{gate.rows.toLocaleString()}</td><td>{gate.status === "ready" ? "Ready" : <span className="status-error">Blocked</span>}</td><td>{gate.reasons.length ? gate.reasons.join(" · ") : "All player import requirements recorded"}</td></tr>)}</tbody></table></div> : <p className="empty">No player-shaped asset is available to evaluate for D{division} import.</p>}
        </div>;
      })() : null}
      {signals ? <div className="paper-panel" style={{ marginTop: 18 }}>
        <div className="eyebrow">SOURCE SIGNAL · NOT A DIVISION LABEL</div>
        <h3>{signals.rows.toLocaleString()} scheduled non-Division-I signal{signals.rows === 1 ? "" : "s"}</h3>
        <p className="note">{signals.note}</p>
        {signals.games.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Away</th><th>Home</th><th>Source field</th></tr></thead><tbody>{signals.games.map((game) => <tr key={game.game_id}><td>{date(game.date)}</td><td>{game.away || "—"}</td><td>{game.home || "—"}</td><td><code>{game.source_flag}</code></td></tr>)}</tbody></table></div> : null}
      </div> : null}
      <details className="paper-panel" style={{ marginTop: 18 }}><summary><strong>What is required before publishing D{division}</strong></summary><ul>{publication.import_contract.next_required_inputs.map((item) => <li key={item}>{item}</li>)}</ul><p className="note">Required scope: {(publication.import_contract.required_scope_fields || ["sport", "gender", "division", "season"]).join(", ")}. Required identities: {(publication.import_contract.required_identity_fields || ["team_id", "team_display_name", "athlete_id", "athlete_display_name"]).join(", ")}. Accepted division values: {(publication.import_contract.accepted_division_values || [2, 3]).join(", ")}.</p><p className="note">The importer also requires explicit division labels, stable identities, receipt hashes, and conflict rejection.</p></details>
      <p className="muted">Readiness ledger captured {date(publication.generated_at)}. Values are source evidence; no D{division} rows are inferred.</p>
    </>}
  </section>;
}
