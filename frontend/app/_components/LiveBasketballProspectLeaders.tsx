"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { date, fmt } from "../_lib/format";
import { fetchJson } from "../_lib/fetch-json";
import { downloadCsv, toCsv, type CsvCell } from "../_lib/csv";

type Prospect = {
  athlete_id: string;
  name: string;
  position?: string | null;
  rank?: number | null;
  previous_rank?: number | null;
  position_rank?: number | null;
  state_rank?: number | null;
  region_rank?: number | null;
  grade?: number | null;
  committed_team_name?: string | null;
  committed_team_id?: string | null;
  status?: string | null;
  high_school?: string | null;
  hometown?: string | null;
  height_inches?: number | null;
  weight_pounds?: number | null;
  captured_at?: string | null;
};

type ProspectResponse = {
  season: number;
  total: number;
  captured_at?: string | null;
  rows: Prospect[];
  cohort?: {
    committed?: number;
    ranked?: number;
    graded?: number;
  };
  position_breakdown?: Array<{ position: string; total: number }>;
  commitment_destinations?: Array<{
    team_id?: string | null;
    team: string;
    total: number;
    top100_total?: number;
    best_rank?: number | null;
    average_rank?: number | null;
  }>;
};

const prospectSeasons = [2025, 2026, 2027, 2028, 2029, 2030] as const;
export type ProspectSeason = (typeof prospectSeasons)[number];

const movement = (row: Prospect) => {
  if (row.rank == null || row.previous_rank == null) return "—";
  const delta = row.previous_rank - row.rank;
  return delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : "—";
};

export const prospectCsvHeaders = [
  "Class", "Rank", "Previous rank", "Movement", "Prospect ID", "Prospect", "Position",
  "Grade", "Position rank", "State rank", "Region rank", "Status", "Destination ID",
  "Destination", "High school", "Hometown", "Height (in)", "Weight (lb)", "Captured",
];

export function prospectCsvRows(rows: Prospect[], season: number): CsvCell[][] {
  return rows.map((row) => [
    season,
    row.rank ?? null,
    row.previous_rank ?? null,
    movement(row),
    row.athlete_id,
    row.name,
    row.position ?? null,
    row.grade ?? null,
    row.position_rank ?? null,
    row.state_rank ?? null,
    row.region_rank ?? null,
    row.status ?? null,
    row.committed_team_id ?? null,
    row.committed_team_name ?? null,
    row.high_school ?? null,
    row.hometown ?? null,
    row.height_inches ?? null,
    row.weight_pounds ?? null,
    row.captured_at ?? null,
  ]);
}

export const prospectCountLabel = (total: number, season: number) =>
  `${total.toLocaleString()} prospects in the ${season} class`;

export const formatProspectSize = (row: Prospect) => {
  const height = row.height_inches;
  const weight = row.weight_pounds;
  const heightLabel = typeof height === "number" && height > 0
    ? `${Math.floor(height / 12)}'${height % 12}\"`
    : null;
  const weightLabel = typeof weight === "number" && weight > 0 ? `${weight} lb` : null;
  return [heightLabel, weightLabel].filter(Boolean).join(" · ") || "—";
};

export default function LiveBasketballProspectLeaders() {
  const [data, setData] = useState<ProspectResponse | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const [season, setSeason] = useState<ProspectSeason>(2027);
  const [query, setQuery] = useState("");
  const [rowLimit, setRowLimit] = useState<10 | 25 | 50>(10);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const exportProspects = async () => {
    if (!data || exporting) return;
    setExporting(true);
    setExportMessage("");
    try {
      const params = new URLSearchParams({ season: String(season), committed: "all" });
      if (query.trim()) params.set("q", query.trim());
      const pageCount = Math.ceil(data.total / 50);
      const pages = await Promise.all(
        Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
          fetchJson<ProspectResponse>(`/api/basketball/research/recruiting-rankings?${params.toString()}&page=${index + 1}`),
        ),
      );
      if (pages.some((page) => page.season !== season || page.total !== data.total)) {
        throw new Error("The prospect release changed during export.");
      }
      const rows = [
        ...(data.rows || []),
        ...pages.flatMap((page) => page.rows || []),
      ].slice(0, data.total);
      if (rows.length !== data.total) throw new Error("The prospect release returned an incomplete export.");
      downloadCsv(
        `basketball-prospects-${season}.csv`,
        toCsv(prospectCsvHeaders, prospectCsvRows(rows, season)),
      );
    } catch {
      setExportMessage("The full class export is temporarily unavailable; try again or open the recruiting board.");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    setData(null);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ season: String(season), page: "0", committed: "all" });
      if (query.trim()) params.set("q", query.trim());
      fetchJson<ProspectResponse>(
        `/api/basketball/research/recruiting-rankings?${params.toString()}`,
        { signal: controller.signal },
      )
      .then((payload) => {
        if (!controller.signal.aborted) {
          setData(payload);
          setStatus(payload.rows?.length ? "ready" : "unavailable");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("unavailable");
      });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, season]);

  return (
    <section className="dashboard-section" aria-labelledby="dashboard-prospects">
      <div className="dashboard-section-heading">
        <div><span className="eyebrow">08 / PROSPECT RANKINGS</span><h2 id="dashboard-prospects">Top {season} prospects</h2></div>
        <div className="button-row">
          <label className="control">
            <span>CLASS</span>
            <select value={season} onChange={(event) => setSeason(Number(event.target.value) as ProspectSeason)}>
              {prospectSeasons.map((value) => <option key={value} value={value}>{value} class</option>)}
            </select>
          </label>
          <label className="control"><span>SEARCH</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Prospect or destination" aria-label="Search prospect or destination" /></label>
          <label className="control"><span>SHOW</span><select value={rowLimit} onChange={(event) => setRowLimit(Number(event.target.value) as 10 | 25 | 50)}><option value={10}>10 rows</option><option value={25}>25 rows</option><option value={50}>50 rows</option></select></label>
          <button className="button secondary" type="button" onClick={exportProspects} disabled={exporting || !data?.rows.length}>{exporting ? "Preparing CSV…" : "Download class CSV ↓"}</button>
          <Link href="/basketball/recruiting/">Full recruiting board →</Link>
        </div>
      </div>
      {exportMessage && <p className="note" role="status">{exportMessage}</p>}
      <p className="dashboard-caption">Current national ranking, movement, grade and destination in a compact {season} class view. The full board supports every tracked class, position and commitment filter.</p>
      {status === "checking" ? <p className="empty" role="status">Loading current prospects…</p> : status === "unavailable" || !data ? <p className="empty" role="status">The live prospect board is temporarily unavailable. <Link href="/basketball/recruiting/">Open the recruiting board →</Link></p> : (
        <>
          <div className="dashboard-strip dashboard-recruiting-strip">
            <div><strong>{data.total.toLocaleString()}</strong><span>Prospects tracked</span></div>
            <div><strong>{(data.cohort?.ranked ?? 0).toLocaleString()}</strong><span>With national rank</span></div>
            <div><strong>{(data.cohort?.graded ?? 0).toLocaleString()}</strong><span>With numeric grade</span></div>
            <div><strong>{(data.cohort?.committed ?? 0).toLocaleString()}</strong><span>With recorded destination</span></div>
          </div>
          <div className="dashboard-table-wrap">
            <table className="data-table dashboard-table">
              <thead><tr><th>Rank</th><th>Prospect</th><th>Position</th><th className="numeric">Movement</th><th className="numeric">Grade</th><th>Size</th><th>Hometown</th><th>Destination</th></tr></thead>
              <tbody>{data.rows.slice(0, rowLimit).map((row) => (
                <tr key={row.athlete_id}>
                  <td className="rank-number">{row.rank ?? "—"}</td>
                  <th scope="row"><Link href={`/basketball/recruiting/prospect/?season=${data.season}&id=${encodeURIComponent(row.athlete_id)}`}>{row.name}</Link></th>
                  <td>{row.position || "—"}</td>
                  <td className={`numeric${row.previous_rank != null && row.rank != null && row.rank < row.previous_rank ? " movement-up" : row.previous_rank != null && row.rank != null && row.rank > row.previous_rank ? " movement-down" : ""}`}>{movement(row)}</td>
                  <td className="numeric">{row.grade == null || row.grade <= 0 ? "—" : fmt(row.grade, 1)}</td>
                  <td>{formatProspectSize(row)}</td>
                  <td>{row.hometown || row.high_school || "—"}</td>
                  <td>{row.committed_team_id ? <Link href={`/basketball/programs/${encodeURIComponent(row.committed_team_id)}/`}>{row.committed_team_name || "Recorded destination"}</Link> : row.committed_team_name || row.status || "Undecided"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="dashboard-two-col" style={{ marginTop: 18 }}>
            <div className="dashboard-table-wrap">
              <table className="data-table dashboard-table">
                <caption className="eyebrow" style={{ captionSide: "top", textAlign: "left", padding: "0 0 8px" }}>Position mix</caption>
                <thead><tr><th>Position</th><th className="numeric">Players</th></tr></thead>
                <tbody>{(data.position_breakdown || []).slice(0, 6).map((row) => <tr key={row.position}><th scope="row">{row.position}</th><td className="numeric">{row.total.toLocaleString()}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="dashboard-table-wrap">
              <table className="data-table dashboard-table">
                <caption className="eyebrow" style={{ captionSide: "top", textAlign: "left", padding: "0 0 8px" }}>Top recorded destinations</caption>
                <thead><tr><th>Program</th><th className="numeric">Players</th><th className="numeric">Top 100</th><th className="numeric">Best rank</th></tr></thead>
                <tbody>{(data.commitment_destinations || []).slice(0, 6).map((row) => <tr key={`${row.team_id || row.team}`}>
                  <th scope="row">{row.team_id ? <Link href={`/basketball/programs/${encodeURIComponent(row.team_id)}/`}>{row.team}</Link> : row.team}</th>
                  <td className="numeric">{row.total.toLocaleString()}</td>
                  <td className="numeric">{(row.top100_total ?? 0).toLocaleString()}</td>
                  <td className="numeric">{row.best_rank == null ? "—" : `#${row.best_rank}`}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
          <p className="dashboard-updated">{prospectCountLabel(data.total, data.season)} · captured {data.captured_at ? date(data.captured_at) : "time unavailable"}</p>
        </>
      )}
    </section>
  );
}
