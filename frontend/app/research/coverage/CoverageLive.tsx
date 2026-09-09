"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { date } from "../../_lib/format";

type CoverageResponse = {
  coverage: Array<{ dataset: string; rows: number }>;
  source_receipts: Array<{ dataset: string; source_count: number; latest_source_at: string | null }>;
  location_validation?: {
    total: number;
    neutral: number;
    missing_venue: number;
    unconfirmed_start: number;
    same_participant: number;
    invalid_periods: number;
    completed_missing_score: number;
  } | null;
  possession_validation?: {
    total: number;
    paired_box_games: number;
    missing_box_games: number;
    negative_field_games: number;
    impossible_shooting_games?: number;
    nonpositive_possession_games: number;
    invalid_period_games: number;
    outlier_pace_games: number;
    score_mismatch_games: number;
    valid_estimate_games: number;
  } | null;
};

type CareerArchiveResponse = {
  seasons?: Array<{
    season: number;
    identified_rows: number | null;
    player_team_entries: number | null;
    appearance_games: number | null;
    completed_schedule_games: number | null;
    latest_receipt: string | null;
  }>;
  latest_receipt?: string | null;
};

type Freshness = {
  label: string;
  detail: string;
  tone: "fresh" | "recent" | "stale" | "missing";
};

function freshness(receipts: CoverageResponse["source_receipts"]): Freshness {
  const timestamps = receipts
    .map((receipt) => receipt.latest_source_at ? Date.parse(receipt.latest_source_at) : Number.NaN)
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return { label: "No source clock", detail: "No dated receipt is available.", tone: "missing" };
  const latest = Math.max(...timestamps);
  const ageHours = Math.max(0, (Date.now() - latest) / 3_600_000);
  const age = ageHours < 1
    ? "less than an hour ago"
    : ageHours < 24
      ? `${Math.floor(ageHours)} hours ago`
      : `${Math.floor(ageHours / 24)} days ago`;
  if (ageHours <= 48) return { label: "Fresh source clock", detail: `Latest receipt ${age}.`, tone: "fresh" };
  if (ageHours <= 168) return { label: "Recent source clock", detail: `Latest receipt ${age}.`, tone: "recent" };
  return { label: "Stale source clock", detail: `Latest receipt ${age}; review before relying on current context.`, tone: "stale" };
}

const labels: Record<string, string> = {
  games: "Games",
  player_box: "Player box rows",
  ncaa_player_box: "NCAA player-game rows",
  ncaa_player_shooting: "NCAA shooting profiles",
  forecasts: "Forecast registrations",
  unresolved: "Identity-review rows",
};

export default function CoverageLive() {
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [football, setFootball] = useState<CoverageResponse | null>(null);
  const [career, setCareer] = useState<CareerArchiveResponse | null>(null);
  const [error, setError] = useState("");
  const [footballError, setFootballError] = useState("");
  const [careerError, setCareerError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const load = (url: string, onValue: (value: CoverageResponse) => void, onError: (value: string) => void) => fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The live D1 coverage check is unavailable.");
        return response.json() as Promise<CoverageResponse>;
      })
      .then((value) => { if (!controller.signal.aborted) onValue(value); })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") onError(reason instanceof Error ? reason.message : "The live D1 coverage check is unavailable.");
      });
    void load("/api/basketball/research/coverage", setData, setError);
    void load("/api/football/coverage", setFootball, setFootballError);
    void fetch("/api/basketball/research/careers/meta", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The live career archive check is unavailable.");
        return response.json() as Promise<CareerArchiveResponse>;
      })
      .then((value) => { if (!controller.signal.aborted) setCareer(value); })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") setCareerError(reason instanceof Error ? reason.message : "The live career archive check is unavailable.");
      });
    return () => controller.abort();
  }, []);

  const rows = data?.coverage.filter((row) => labels[row.dataset]) || [];
  const footballRows = football?.coverage || [];
  const footballLabel = (dataset: string) => dataset === "games" ? "Games" : `${dataset.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} rows`;
  const basketballFreshness = data ? freshness(data.source_receipts) : null;
  const footballFreshness = football ? freshness(football.source_receipts) : null;
  return (
    <section className="section" aria-live="polite">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Live Cloudflare check</div>
          <h2>Confirm the warehouse behind the page.</h2>
        </div>
        <span className="note">{data && football ? "Football + basketball reads successful" : error || footballError ? "One D1 read unavailable" : "Checking D1…"}</span>
      </div>
      <p className="note">This read-only check queries the deployed Cloudflare D1 database, rather than the bundled static files. It gives the current remote row counts and the latest source receipt clocks used by the research publisher.</p>
      {error && <p className="status-error" role="alert">Basketball: {error}</p>}
      {footballError && <p className="status-error" role="alert">Football: {footballError}</p>}
      {!data && !football ? <p className="empty" role="status">Loading remote coverage…</p> : (
        <>
          {data && <><div className="eyebrow" style={{ marginTop: 20 }}>Basketball D1</div><div className="strip">
            {rows.map((row) => <div key={row.dataset}><strong>{Number(row.rows || 0).toLocaleString()}</strong><span>{labels[row.dataset]}</span></div>)}
          </div><div className="table-scroll" style={{ marginTop: 20 }}>
            <table className="data-table">
              <thead><tr><th>Source dataset</th><th className="numeric">D1 receipts</th><th>Latest source clock</th></tr></thead>
              <tbody>{data.source_receipts.map((receipt) => <tr key={receipt.dataset}><td><strong>{receipt.dataset}</strong></td><td className="numeric">{Number(receipt.source_count || 0).toLocaleString()}</td><td>{receipt.latest_source_at ? date(receipt.latest_source_at) : "—"}</td></tr>)}</tbody>
            </table>
          </div>{career && <div className="paper-panel" style={{ marginTop: 20 }}>
            <div className="eyebrow">Historical player archive / D1</div>
            <h3>{career.seasons?.length?.toLocaleString() ?? "—"} source seasons connected.</h3>
            <div className="raw-stat-grid">
              <div><dt>{career.seasons?.reduce((sum, row) => sum + (row.identified_rows || 0), 0).toLocaleString() ?? "—"}</dt><dd>Identified player box rows</dd></div>
              <div><dt>{career.seasons?.reduce((sum, row) => sum + (row.player_team_entries || 0), 0).toLocaleString() ?? "—"}</dt><dd>Player / program records</dd></div>
              <div><dt>{career.seasons?.[0]?.season ?? "—"}</dt><dd>Newest season ending year</dd></div>
              <div><dt>{career.latest_receipt ? date(career.latest_receipt) : "—"}</dt><dd>Latest source receipt</dd></div>
            </div>
            <p className="note">This bounded read confirms the active D1 archive pointer without returning player rows. Open the player statistics desk to search the verified bundled release and follow exact source IDs into game logs.</p>
            <Link href="/basketball/players/">Open player statistics →</Link>
          </div>}{careerError && <p className="note">Historical player archive: {careerError} The bundled coverage inventory remains available.</p>}<div className="paper-panel" style={{ marginTop: 20 }}>
            <div className="eyebrow">Source clock</div>
            <h3>{basketballFreshness?.label}</h3>
            <p className="note">{basketballFreshness?.detail} This describes the newest retained source receipt, not statistical completeness or game availability.</p>
            <span className="status-pill">{basketballFreshness?.tone === "fresh" ? "Within 48 hours" : basketballFreshness?.tone === "recent" ? "Within 7 days" : basketballFreshness?.tone === "stale" ? "Older than 7 days" : "Clock unavailable"}</span>
          </div>{data.location_validation && <div className="paper-panel" style={{ marginTop: 20 }}>
            <div className="eyebrow">Schedule integrity / location fields</div>
            <h3>Know which game context is usable.</h3>
            <div className="raw-stat-grid">
              <div><dt>{data.location_validation.total.toLocaleString()}</dt><dd>Schedule records checked</dd></div>
              <div><dt>{data.location_validation.neutral.toLocaleString()}</dt><dd>Neutral-site records</dd></div>
              <div><dt>{data.location_validation.unconfirmed_start.toLocaleString()}</dt><dd>Unconfirmed start times</dd></div>
              <div><dt>{data.location_validation.missing_venue.toLocaleString()}</dt><dd>Missing venue labels</dd></div>
              <div><dt>{data.location_validation.same_participant.toLocaleString()}</dt><dd>Same-side participant IDs</dd></div>
              <div><dt>{data.location_validation.invalid_periods.toLocaleString()}</dt><dd>Missing/invalid period fields</dd></div>
              <div><dt>{data.location_validation.completed_missing_score.toLocaleString()}</dt><dd>Completed rows missing a score</dd></div>
            </div>
            <p className="note">Neutral-site flags, venue labels, participant IDs, period counts and final scores stay separate from player identity joins. Forecast and efficiency calculations continue to exclude records that fail their own paired-data checks.</p>
          </div>}{data.possession_validation && <div className="paper-panel" style={{ marginTop: 20 }}>
            <div className="eyebrow">Possession estimate integrity</div>
            <h3>See how much of the completed schedule is model-ready.</h3>
            <div className="raw-stat-grid">
              <div><dt>{data.possession_validation.total.toLocaleString()}</dt><dd>Completed games checked</dd></div>
              <div><dt>{data.possession_validation.paired_box_games.toLocaleString()}</dt><dd>Games with all four team fields</dd></div>
              <div><dt>{data.possession_validation.valid_estimate_games.toLocaleString()}</dt><dd>Valid possession estimates</dd></div>
              <div><dt>{data.possession_validation.missing_box_games.toLocaleString()}</dt><dd>Missing required team box fields</dd></div>
              <div><dt>{data.possession_validation.negative_field_games.toLocaleString()}</dt><dd>Negative box-score fields</dd></div>
              <div><dt>{data.possession_validation.impossible_shooting_games?.toLocaleString() ?? "—"}</dt><dd>Impossible shooting totals</dd></div>
              <div><dt>{data.possession_validation.nonpositive_possession_games.toLocaleString()}</dt><dd>Nonpositive estimates</dd></div>
              <div><dt>{data.possession_validation.outlier_pace_games.toLocaleString()}</dt><dd>Outlier pace estimates</dd></div>
              <div><dt>{data.possession_validation.score_mismatch_games.toLocaleString()}</dt><dd>Box score / schedule mismatches</dd></div>
            </div>
            <p className="note">The diagnostic mirrors the model’s required FGA, FTA, offensive-rebound, turnover, shooting-total and period guards. Only games with valid estimates enter efficiency features; mismatch counts remain visible for review.</p>
          </div>}</>}
          {football && <><div className="eyebrow" style={{ marginTop: 28 }}>Football D1</div><div className="strip">
            {footballRows.map((row) => <div key={row.dataset}><strong>{Number(row.rows || 0).toLocaleString()}</strong><span>{footballLabel(row.dataset)}</span></div>)}
          </div><div className="table-scroll" style={{ marginTop: 20 }}>
            <table className="data-table">
              <thead><tr><th>Source dataset</th><th className="numeric">D1 receipts</th><th>Latest source clock</th></tr></thead>
              <tbody>{football.source_receipts.map((receipt) => <tr key={receipt.dataset}><td><strong>{receipt.dataset}</strong></td><td className="numeric">{Number(receipt.source_count || 0).toLocaleString()}</td><td>{receipt.latest_source_at ? date(receipt.latest_source_at) : "—"}</td></tr>)}</tbody>
            </table>
          </div><div className="paper-panel" style={{ marginTop: 20 }}>
            <div className="eyebrow">Source clock</div>
            <h3>{footballFreshness?.label}</h3>
            <p className="note">{footballFreshness?.detail} This describes the newest retained source receipt, not statistical completeness or game availability.</p>
            <span className="status-pill">{footballFreshness?.tone === "fresh" ? "Within 48 hours" : footballFreshness?.tone === "recent" ? "Within 7 days" : footballFreshness?.tone === "stale" ? "Older than 7 days" : "Clock unavailable"}</span>
          </div></>}
          <p className="note">Counts are remote table rows, not deduplicated people. Source receipts identify the publisher edition; unresolved rows and name-attributed event records remain visible for review.</p>
        </>
      )}
    </section>
  );
}
