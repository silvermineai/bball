"use client";
import { useState } from "react";
import Link from "next/link";
import type { BBRosters } from "../../_lib/basketball-types";
import { useBasketballRelease } from "../../_components/useBasketballRelease";
const labels: Record<string, string> = {
  same_program: "Prior program also observed",
  different_program: "Different program observed",
  new_to_dataset: "No prior appearance in dataset",
  ambiguous: "Multiple current programs",
};
export default function Recruiting() {
  const [season, setSeason] = useState("2027"),
    [q, setQ] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(0);
  const { data, error } = useBasketballRelease<BBRosters>(
    season === "2027" ? "rosters" : "rosters-2026",
  );
  const rows = (data?.players || []).filter(
    (p) =>
      (p.name + " " + p.team + " " + p.previous_teams.join(" "))
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (status === "all" || p.status === status),
  );
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>VIEW</span>
          <select
            value={season}
            onChange={(e) => {
              setSeason(e.target.value);
              setStatus("all");
              setPage(0);
            }}
          >
            <option value="2027">2026–27 · Unconfirmed source listings</option>
            <option value="2026">2025–26 · Recorded game appearances</option>
          </select>
        </label>
        <label className="control">
          <span>PLAYER OR PROGRAM</span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search current or prior program"
          />
        </label>
        <label className="control">
          <span>OBSERVATION</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All observations</option>
            {Object.entries(labels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="status-error">
          {error}
        </p>
      ) : !data ? (
        <p className="empty" role="status">
          Loading roster observations…
        </p>
      ) : (
        <>
          <div
            className="strip"
            style={{ borderTop: "1px solid var(--ink)", marginBottom: 25 }}
          >
            <div>
              <strong>{data.teams_observed}</strong>
              <span>Programs in this source view</span>
            </div>
            <div>
              <strong>{data.players_observed.toLocaleString()}</strong>
              <span>Distinct observed player IDs</span>
            </div>
            <div>
              <strong>
                {data.status_counts.different_program?.toLocaleString() || 0}
              </strong>
              <span>Different program records</span>
            </div>
            <div>
              <strong>
                {data.status_counts.new_to_dataset?.toLocaleString() || 0}
              </strong>
              <span>No prior appearance found</span>
            </div>
          </div>
          <p className="note" style={{ marginBottom: 22 }}>
            {season === "2027"
              ? "Listings can carry over from earlier seasons; no school-confirmed current transfer status is supplied. Missing players may reflect incomplete rosters, not departures."
              : "Both sides of this comparison require recorded playing time. A different program record describes historical participation, not why or when a transfer happened."}{" "}
            New to the dataset does not mean freshman.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>
                    {season === "2027"
                      ? "Source-listed program"
                      : "Observed program"}
                  </th>
                  <th>Prior appearances</th>
                  <th>Observation</th>
                  <th>Source-listed class</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 40, page * 40 + 40).map((p) => (
                  <tr key={`${p.id}-${p.team_id}`}>
                    <td>
                      <Link href={`/basketball/player/?id=${p.id}`}>
                        {p.name}
                      </Link>
                      <small>
                        {[p.position, p.height].filter(Boolean).join(" · ")}
                      </small>
                    </td>
                    <td>{p.team}</td>
                    <td>{p.previous_teams.join(", ") || "Not observed"}</td>
                    <td>{labels[p.status]}</td>
                    <td>{p.class_year || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="empty">
              No records match this view. Zero observed changes does not
              establish that no transfers occurred.
            </p>
          )}
          <div className="pagination">
            <span>
              {rows.length.toLocaleString()} records · page {page + 1} of{" "}
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
