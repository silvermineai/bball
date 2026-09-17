"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { date, fmt } from "../_lib/format";
import { fetchJson } from "../_lib/fetch-json";

type Prospect = {
  athlete_id: string;
  name: string;
  position?: string | null;
  rank?: number | null;
  previous_rank?: number | null;
  grade?: number | null;
  committed_team_name?: string | null;
  committed_team_id?: string | null;
  status?: string | null;
  high_school?: string | null;
  hometown?: string | null;
  height_inches?: number | null;
  weight_pounds?: number | null;
};

type ProspectResponse = {
  season: number;
  total: number;
  captured_at?: string | null;
  rows: Prospect[];
};

const prospectSeasons = [2025, 2026, 2027, 2028, 2029, 2030] as const;
export type ProspectSeason = (typeof prospectSeasons)[number];

const movement = (row: Prospect) => {
  if (row.rank == null || row.previous_rank == null) return "—";
  const delta = row.previous_rank - row.rank;
  return delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : "—";
};

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

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    setData(null);
    fetchJson<ProspectResponse>(
      `/api/basketball/research/recruiting-rankings?season=${season}&page=0&committed=all`,
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
    return () => controller.abort();
  }, [season]);

  return (
    <section className="dashboard-section" aria-labelledby="dashboard-prospects">
      <div className="dashboard-section-heading">
        <div><span className="eyebrow">06 / PROSPECT RANKINGS</span><h2 id="dashboard-prospects">Top {season} prospects</h2></div>
        <div className="button-row">
          <label className="control">
            <span>CLASS</span>
            <select value={season} onChange={(event) => setSeason(Number(event.target.value) as ProspectSeason)}>
              {prospectSeasons.map((value) => <option key={value} value={value}>{value} class</option>)}
            </select>
          </label>
          <Link href="/basketball/recruiting/">Full recruiting board →</Link>
        </div>
      </div>
      <p className="dashboard-caption">Current national ranking, movement, grade and destination in a compact {season} class view. The full board supports every tracked class, position and commitment filter.</p>
      {status === "checking" ? <p className="empty" role="status">Loading current prospects…</p> : status === "unavailable" || !data ? <p className="empty" role="status">The live prospect board is temporarily unavailable. <Link href="/basketball/recruiting/">Open the recruiting board →</Link></p> : (
        <>
          <div className="dashboard-table-wrap">
            <table className="data-table dashboard-table">
              <thead><tr><th>Rank</th><th>Prospect</th><th>Position</th><th className="numeric">Movement</th><th className="numeric">Grade</th><th>Size</th><th>Hometown</th><th>Destination</th></tr></thead>
              <tbody>{data.rows.slice(0, 10).map((row) => (
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
          <p className="dashboard-updated">{prospectCountLabel(data.total, data.season)} · captured {data.captured_at ? date(data.captured_at) : "time unavailable"}</p>
        </>
      )}
    </section>
  );
}
