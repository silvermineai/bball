"use client";
import { useState } from "react";
import Link from "next/link";
import type { BBTeam } from "../../_lib/basketball-types";
import { fmt } from "../../_lib/format";
import {
  sortTeamRatings,
  type RatingSortKey,
} from "../../_lib/basketball-ratings";
const sortLabels: Record<RatingSortKey, string> = {
  adj_net: "Adjusted net efficiency",
  adj_off: "Offense · higher first",
  adj_def: "Defense · lower first",
  adj_tempo: "Tempo · faster first",
  sos: "Strength of schedule",
  efg: "Effective FG% · higher first",
  tov_rate: "Turnover rate · lower first",
  orb_rate: "Offensive rebound rate · higher first",
  ft_rate: "Free throw rate · higher first",
  three_rate: "Three point attempt rate · higher first",
};
export default function Ratings({ rows }: { rows: BBTeam[] }) {
  const [q, setQ] = useState(""),
    [sort, setSort] = useState<RatingSortKey>("adj_net");
  const filtered = sortTeamRatings(
    rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())),
    sort,
  );
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>PROGRAM</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search programs"
          />
        </label>
        <label className="control">
          <span>SORT</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as RatingSortKey)}
          >
            {Object.entries(sortLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Net rank</th>
              <th>Program</th>
              {[
                "Adj O",
                "Adj D",
                "Net",
                "Tempo",
                "SOS",
                "Rated opp.",
                "eFG%",
                "TO%",
                "ORB%",
                "FT rate",
                "3PA rate",
              ].map((k) => (
                <th key={k} className="numeric">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td className="rank-number">{t.rank}</td>
                <td>
                  <Link href={`/basketball/programs/${t.id}/`}>{t.name}</Link>
                  <small>
                    {t.wins}–{t.games - t.wins} in paired box-score games
                  </small>
                </td>
                {[
                  t.adj_off,
                  t.adj_def,
                  t.adj_net,
                  t.adj_tempo,
                  t.sos,
                  t.sos_games,
                  ...[
                    t.efg,
                    t.tov_rate,
                    t.orb_rate,
                    t.ft_rate,
                    t.three_rate,
                  ].map((n) => (n == null ? null : n * 100)),
                ].map((v, i) => (
                  <td className="numeric" key={i}>
                    {fmt(v, i === 5 ? 0 : 1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <p className="empty">No programs match that search.</p>
      )}
    </>
  );
}
