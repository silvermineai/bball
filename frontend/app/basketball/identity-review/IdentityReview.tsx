"use client";
import { useEffect, useMemo, useState } from "react";
import { downloadCsv, toCsv } from "../../_lib/csv";

type Dataset = "all" | "player_box" | "ncaa_player_box" | "ncaa_shots" | "publisher_player_value";
type UnresolvedRow = {
  dataset: string;
  season: number;
  row_index: number;
  reason: string;
  source: Record<string, unknown>;
};
type Result = {
  dataset: Dataset;
  season: number | null;
  reason: string;
  q: string;
  page: number;
  limit: number;
  total: number;
  rows: UnresolvedRow[];
};

const datasetLabels: Record<Dataset, string> = {
  all: "All withheld rows",
  player_box: "ESPN-derived player box",
  ncaa_player_box: "NCAA player box",
  ncaa_shots: "NCAA shooting events",
  publisher_player_value: "Publisher player value",
};
const seasons = Array.from({ length: 17 }, (_, index) => 2010 + index);
const displayValue = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (value != null && String(value).trim() !== "") return String(value);
  }
  return "—";
};
const observedFieldCount = (source: Record<string, unknown>) =>
  Object.values(source).filter((value) => value != null && String(value).trim() !== "").length;

export default function IdentityReview() {
  const initial = useMemo(() => {
    if (typeof window === "undefined") return { dataset: "ncaa_player_box" as Dataset, season: "", reason: "", q: "", page: 0 };
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("dataset") as Dataset | null;
    return {
      dataset: requested && requested in datasetLabels ? requested : "ncaa_player_box",
      season: params.get("season") || "",
      reason: params.get("reason") || "",
      q: params.get("q") || "",
      page: Math.max(0, Math.min(1000, Number(params.get("page") || 0))),
    };
  }, []);
  const [dataset, setDataset] = useState<Dataset>(initial.dataset);
  const [season, setSeason] = useState(initial.season);
  const [reason, setReason] = useState(initial.reason);
  const [q, setQ] = useState(initial.q);
  const [page, setPage] = useState(initial.page);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (dataset !== "ncaa_player_box") params.set("dataset", dataset);
    if (season) params.set("season", season);
    if (reason.trim()) params.set("reason", reason.trim());
    if (q.trim()) params.set("q", q.trim());
    if (page) params.set("page", String(page));
    const next = params.toString();
    window.history.replaceState(window.history.state, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
  }, [dataset, page, q, reason, season]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ dataset, page: String(page), limit: "40" });
    if (season) params.set("season", season);
    if (reason.trim()) params.set("reason", reason.trim());
    if (q.trim()) params.set("q", q.trim());
    setError("");
    fetch(`/api/basketball/research/unresolved?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The identity-review rows could not be loaded. Please try again.");
        return response.json() as Promise<Result>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((caught: Error) => {
        if (caught.name !== "AbortError") setError(caught.message);
      });
    return () => controller.abort();
  }, [dataset, page, q, reason, season]);

  const pages = Math.max(1, Math.ceil((result?.total || 0) / (result?.limit || 40)));
  const pageRows = result?.rows || [];
  const exportRows = pageRows.map((row) => [
    row.dataset,
    row.season,
    row.row_index,
    row.reason,
    displayValue(row.source, ["player_name", "athlete_display_name", "name"]),
    displayValue(row.source, ["team_name", "team_location", "team_short_display_name"]),
    displayValue(row.source, ["game_id", "contest_id"]),
    observedFieldCount(row.source),
    JSON.stringify(row.source),
  ]);

  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Bounded D1 source queue</div>
          <h2>Rows awaiting a safe identity key.</h2>
        </div>
        <button
          className="button secondary"
          type="button"
          disabled={!pageRows.length}
          onClick={() => downloadCsv(
            "basketball-identity-review.csv",
            toCsv(
              ["Dataset", "Season", "Source row", "Reason", "Source player/name", "Source team", "Game/contest", "Observed fields", "Source JSON"],
              exportRows,
            ),
          )}
        >
          Download page CSV ↓
        </button>
      </div>
      <p className="note">
        These rows remain outside rankings, career totals and forecast features
        until the publisher supplies the missing key. A source value can still
        be useful evidence even when it cannot be safely attached to a player.
        Search matches the retained source JSON and is intentionally limited to
        40 rows per page.
      </p>
      <div className="toolbar">
        <label className="control">
          <span>DATASET</span>
          <select value={dataset} onChange={(event) => { setDataset(event.target.value as Dataset); setPage(0); }}>
            {Object.entries(datasetLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="control">
          <span>SEASON</span>
          <select value={season} onChange={(event) => { setSeason(event.target.value); setPage(0); }}>
            <option value="">All seasons</option>
            {seasons.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="control">
          <span>REASON CONTAINS</span>
          <input maxLength={120} value={reason} onChange={(event) => { setReason(event.target.value); setPage(0); }} placeholder="Missing player ID" />
        </label>
        <label className="control">
          <span>SOURCE SEARCH</span>
          <input maxLength={120} value={q} onChange={(event) => { setQ(event.target.value); setPage(0); }} placeholder="Team, player, contest…" />
        </label>
      </div>
      {error ? <p className="status-error" role="alert">{error}</p> : !result ? <p className="empty" role="status">Loading source rows…</p> : (
        <>
          <p className="note" role="status">
            {result.total.toLocaleString()} matching rows · page {page + 1} of {pages} · {result.dataset === "all" ? "all datasets" : datasetLabels[result.dataset]}
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Source row</th><th>Reason withheld</th><th>Source name</th><th>Source team</th><th>Game / contest</th><th className="numeric">Observed fields</th><th>Retained payload</th></tr></thead>
              <tbody>{pageRows.map((row) => (
                <tr key={`${row.dataset}-${row.season}-${row.row_index}`}>
                  <td><strong>{row.dataset}</strong><small>{row.season} · row {row.row_index}</small></td>
                  <td>{row.reason}</td>
                  <td>{displayValue(row.source, ["player_name", "athlete_display_name", "name"])}</td>
                  <td>{displayValue(row.source, ["team_name", "team_location", "team_short_display_name"])}</td>
                  <td>{displayValue(row.source, ["game_id", "contest_id"])}</td>
                  <td className="numeric">{observedFieldCount(row.source)}</td>
                  <td><details><summary>View source fields</summary><pre className="source-json">{JSON.stringify(row.source, null, 2)}</pre></details></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {!pageRows.length && <p className="empty">No withheld source rows match this review slice.</p>}
          <div className="pagination">
            <button className="button secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>← Previous</button>
            <span>Page {page + 1} of {pages}</span>
            <button className="button secondary" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>Next →</button>
          </div>
        </>
      )}
    </section>
  );
}
