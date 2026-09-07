"use client";
import { useState } from "react";
import type { BBImpact } from "../../_lib/basketball-types";
import { useBasketballRelease } from "../../_components/useBasketballRelease";
import { fmt } from "../../_lib/format";
import {
  sortImpactRows,
  type ImpactSortKey,
} from "../../_lib/basketball-impact";
const sortLabels: Record<ImpactSortKey, string> = {
  rank: "Publisher net rank",
  rapm_net: "Net RAPM · higher first",
  orapm: "ORAPM · higher first",
  drapm: "DRAPM · higher first",
  off_poss: "Offensive possessions",
  def_poss: "Defensive possessions",
};
export default function Impact() {
  const { data, error } = useBasketballRelease<{ players: BBImpact[] }>(
    "impact",
  );
  const [q, setQ] = useState(""),
    [qualified, setQualified] = useState(true),
    [sort, setSort] = useState<ImpactSortKey>("rank"),
    [page, setPage] = useState(0);
  const rows = sortImpactRows(
    (data?.players || []).filter(
      (p) =>
        (p.player.replaceAll(".", " ") + " " + p.team)
          .toLowerCase()
          .includes(q.toLowerCase()) &&
        (!qualified || p.qualified),
    ),
    sort,
  );
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>PLAYER OR TEAM</span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search impact rankings"
          />
        </label>
        <label className="control">
          <span>SORT IMPACT BOARD</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as ImpactSortKey);
              setPage(0);
            }}
          >
            {Object.entries(sortLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="note">
        <input
          type="checkbox"
          checked={qualified}
          onChange={(e) => {
            setQualified(e.target.checked);
            setPage(0);
          }}
        />{" "}
        Qualified sample only · 500 possessions at each end
      </label>
      {error ? (
        <p role="alert" className="status-error">
          {error}
        </p>
      ) : !data ? (
        <p className="empty" role="status">
          Loading player impact…
        </p>
      ) : (
        <>
          <div className="table-scroll" style={{ marginTop: 20 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Net rank</th>
                  <th>Player / NCAA identity</th>
                  <th>Program</th>
                  {["ORAPM", "DRAPM", "Net", "Off. poss.", "Def. poss."].map(
                    (k) => (
                      <th key={k} className="numeric">
                        {k}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 40, page * 40 + 40).map((p) => (
                  <tr key={p.player_id}>
                    <td className="rank-number">{p.rank ?? "—"}</td>
                    <td>
                      {p.player.replaceAll(".", " ")}
                      <small>NCAA {p.player_id}</small>
                    </td>
                    <td>{p.team}</td>
                    {[p.orapm, p.drapm, p.rapm_net, p.off_poss, p.def_poss].map(
                      (v, i) => (
                        <td key={i} className="numeric">
                          {fmt(v, i > 2 ? 0 : 2)}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="empty">No players match that search.</p>
          )}
          <div className="pagination">
            <span>
              {rows.length} records · {sortLabels[sort]} · page {page + 1} of{" "}
              {Math.max(1, Math.ceil(rows.length / 40))}
            </span>
            <div>
              <button
                className="button secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                ← Previous
              </button>
              <button
                className="button secondary"
                disabled={(page + 1) * 40 >= rows.length}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
