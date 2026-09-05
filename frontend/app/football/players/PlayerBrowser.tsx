"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "../../_lib/format";
type Production = {
  plays: number | null;
  yards: number | null;
  epa: number | null;
  epa_per_play: number | null;
  touchdowns: number | null;
  rank: number | null;
};
type Player = {
  id: string;
  team_id: string;
  name: string;
  team: string;
  conference: string;
  division: string;
  season: number;
  categories: string[];
  box_games: number;
  production: Record<string, Production>;
};
type Board = {
  players: Player[];
  season: number;
  rankings: Record<string, { minimum_plays: number; qualified: number }>;
};
export default function PlayerBrowser() {
  const [season, setSeason] = useState("2025"),
    [category, setCategory] = useState("passing"),
    [division, setDivision] = useState("fbs"),
    [query, setQuery] = useState(""),
    [qualified, setQualified] = useState(false),
    [page, setPage] = useState(0),
    [data, setData] = useState<Board | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    fetch(`/data/football/players-${season}.json`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error("Player data is unavailable. Please reload.");
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [season]);
  const rows = (data?.players || []).filter(
    (p) =>
      (p.name + " " + p.team + " " + p.conference)
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (division === "all" || p.division === division) &&
      (category === "all" || p.categories.includes(category)) &&
      (!qualified || p.production[category]?.rank != null),
  );
  rows.sort(
    (a, b) =>
      (a.production[category]?.rank ?? 999999) -
        (b.production[category]?.rank ?? 999999) ||
      a.name.localeCompare(b.name),
  );
  const minimum = data?.rankings[category]?.minimum_plays;
  return (
    <>
      <div className="toolbar">
        <label className="control">
          <span>PLAYER, TEAM OR CONFERENCE</span>
          <input
            type="search"
            placeholder="Search the player index"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="control">
          <span>STAT SEASON</span>
          <select
            value={season}
            onChange={(e) => {
              setSeason(e.target.value);
              setPage(0);
            }}
          >
            <option value="2025">2025 · Prior season</option>
            <option value="2026">2026 · Partial season</option>
          </select>
        </label>
        <label className="control">
          <span>CATEGORY</span>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setQualified(false);
              setPage(0);
            }}
          >
            <option value="all">All players</option>
            {[
              "passing",
              "rushing",
              "receiving",
              "defensive",
              "interceptions",
              "fumbles",
              "kicking",
              "punting",
              "kickReturns",
              "puntReturns",
            ].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>DIVISION</span>
          <select
            value={division}
            onChange={(e) => {
              setDivision(e.target.value);
              setPage(0);
            }}
          >
            <option value="fbs">FBS</option>
            <option value="all">All imported divisions</option>
          </select>
        </label>
      </div>
      {minimum && (
        <label
          style={{
            fontSize: 12,
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            type="checkbox"
            checked={qualified}
            onChange={(e) => {
              setQualified(e.target.checked);
              setPage(0);
            }}
          />
          Show ranked players only (FBS, at least {minimum} plays)
        </label>
      )}
      <p className="note" style={{ marginBottom: 20 }}>
        Ranked by total EPA within{" "}
        {category === "all" ? "each offensive category" : category}.{" "}
        {season === "2025"
          ? "Team affiliations reflect 2025 production, not confirmed 2026 rosters."
          : "Early-season samples are incomplete; unqualified players remain unranked."}{" "}
        A dash means unranked or unavailable, never zero.
      </p>
      {error ? (
        <p role="alert" className="status-error">
          {error}
        </p>
      ) : !data ? (
        <p role="status" className="empty">
          Loading player records…
        </p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>EPA rank</th>
                  <th>Player / team</th>
                  <th>Category</th>
                  <th className="numeric">Box games</th>
                  <th className="numeric">Plays</th>
                  <th className="numeric">Yards</th>
                  <th className="numeric">TD</th>
                  <th className="numeric">Total EPA</th>
                  <th className="numeric">EPA / play</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 40, page * 40 + 40).map((p) => {
                  const s = p.production[category];
                  return (
                    <tr key={`${p.id}-${p.team_id}`}>
                      <td className="rank-number">{s?.rank ?? "—"}</td>
                      <td>
                        <Link
                          href={`/football/player/?id=${p.id}&season=${season}`}
                        >
                          {p.name}
                        </Link>
                        <small>
                          {p.team} · {p.conference}
                        </small>
                      </td>
                      <td>
                        {category === "all"
                          ? p.categories.slice(0, 3).join(", ")
                          : category}
                      </td>
                      <td className="numeric">{p.box_games}</td>
                      <td className="numeric">{fmt(s?.plays, 0)}</td>
                      <td className="numeric">{fmt(s?.yards, 0)}</td>
                      <td className="numeric">{fmt(s?.touchdowns, 0)}</td>
                      <td className="numeric">{fmt(s?.epa)}</td>
                      <td className="numeric">{fmt(s?.epa_per_play, 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="empty">
              No players match these filters. Try another category or season.
            </p>
          )}
          <div className="pagination">
            <span>
              {rows.length.toLocaleString()} matching players · Page {page + 1}{" "}
              of {Math.max(1, Math.ceil(rows.length / 40))}
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
      <p className="note">
        EPA values are published by SportsDataverse. Passing, rushing and
        receiving EPA can credit overlapping plays and must not be added
        together. Defensive and special-teams box scores are available in player
        records; no composite rank is assigned to those roles.
      </p>
    </>
  );
}
