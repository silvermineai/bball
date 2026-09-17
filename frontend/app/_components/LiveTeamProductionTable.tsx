"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "../_lib/format";

type TeamRow = {
  id: string;
  team: string;
  abbreviation?: string | null;
  value: number | null;
};

type TeamStatsResponse = {
  season: number;
  total: number;
  field?: { label?: string; unit?: string };
  rows?: TeamRow[];
};

export function filterDivisionOneTeams(rows: TeamRow[], teamIds: ReadonlySet<string>) {
  return rows.filter((row) => teamIds.has(String(row.id)));
}

export default function LiveTeamProductionTable({ teamIds }: { teamIds: string[] }) {
  const [data, setData] = useState<TeamStatsResponse | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const teamIdKey = teamIds.join(",");

  useEffect(() => {
    const controller = new AbortController();
    const pages = [0, 1, 2].map((page) => fetch(`/api/basketball/research/team-stats?season=2026&category=offensive&stat=avgPoints&page=${page}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Live team production unavailable");
        return response.json() as Promise<TeamStatsResponse>;
      }));
    Promise.all(pages).then((payloads) => {
        if (controller.signal.aborted) return;
        const divisionOneIds = new Set(teamIdKey.split(",").filter(Boolean));
        const rows = filterDivisionOneTeams(payloads.flatMap((payload) => payload.rows || []), divisionOneIds);
        setData({ ...(payloads[0] || {}), rows, total: rows.length });
        setStatus(rows.length ? "ready" : "unavailable");
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setStatus("unavailable");
      });
    return () => controller.abort();
  }, [teamIdKey]);

  return (
    <section className="dashboard-subsection" aria-labelledby="live-team-production">
      <div className="dashboard-section-heading">
        <div><span className="eyebrow">LIVE RAW TEAM DATA</span><h3 id="live-team-production">D1 scoring leaders</h3></div>
        <Link href="/basketball/team-stats/?season=2026&category=offensive&stat=avgPoints">Full team stat browser →</Link>
      </div>
      <p className="dashboard-caption">Current Division I team-season points per game from the live archive. These are descriptive totals beside the adjusted ratings above.</p>
      {status === "checking" ? <p className="empty" role="status">Loading current team production…</p> : status === "unavailable" || !data ? <p className="empty" role="status">Live team production is temporarily unavailable. <Link href="/basketball/team-stats/">Open the team stat browser →</Link></p> : (
        <div className="dashboard-table-wrap">
          <table className="data-table dashboard-table">
            <thead><tr><th>Rank</th><th>Program</th><th>Abbr.</th><th className="numeric">PPG</th></tr></thead>
            <tbody>{data.rows?.slice(0, 8).map((row, index) => (
              <tr key={row.id}>
                <td className="rank-number">{index + 1}</td>
                <th scope="row"><Link href={`/basketball/programs/${encodeURIComponent(row.id)}/`}>{row.team}</Link></th>
                <td>{row.abbreviation || "—"}</td>
                <td className="numeric"><strong>{row.value == null ? "—" : fmt(row.value, 1)}</strong></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
