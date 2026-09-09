"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { BBTeam } from "../../_lib/basketball-types";
import { fmt } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";
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
  luck: "Luck · actual minus expected wins",
  efg: "Effective FG% · higher first",
  tov_rate: "Turnover rate · lower first",
  orb_rate: "Offensive rebound rate · higher first",
  ft_rate: "Free throw rate · higher first",
  three_rate: "Three point attempt rate · higher first",
  adj_off_efg: "Adjusted eFG offense · higher first",
  adj_def_efg: "Adjusted eFG defense · lower first",
  adj_off_tov: "Adjusted turnover offense · lower first",
  adj_def_tov: "Adjusted turnover defense · lower first",
  adj_off_orb: "Adjusted ORB offense · higher first",
  adj_def_orb: "Adjusted ORB defense · lower first",
  adj_off_ftr: "Adjusted FT rate offense · higher first",
  adj_def_ftr: "Adjusted FT rate defense · lower first",
};
export default function Ratings({ rows }: { rows: BBTeam[] }) {
  const [q, setQ] = useState(""),
    [sort, setSort] = useState<RatingSortKey>("adj_net"),
    [hydrated, setHydrated] = useState(false),
    [copied, setCopied] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQ(params.get("q") || "");
    const requestedSort = params.get("sort") as RatingSortKey | null;
    if (requestedSort && Object.prototype.hasOwnProperty.call(sortLabels, requestedSort)) setSort(requestedSort);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sort !== "adj_net") params.set("sort", sort);
    const query = params.toString();
    window.history.replaceState(window.history.state, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [hydrated, q, sort]);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Ratings link copied.");
    } catch {
      setCopied("Copy the filtered ratings URL from your address bar.");
    }
  };
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
        <button className="button secondary" type="button" onClick={share}>Copy ratings link</button>
      </div>
      {copied && <p className="note" role="status">{copied}</p>}
      <div className="section-heading" style={{ marginTop: 20 }}>
        <p>{filtered.length.toLocaleString()} matching programs · export respects the current search and sort</p>
        <button
          className="button secondary"
          type="button"
          onClick={() =>
            downloadCsv(
              "basketball-team-ratings.csv",
              toCsv(
                ["Net rank", "Program", "Wins", "Games", "Expected wins", "Luck (points)", "Adjusted offense", "Adjusted defense", "Adjusted net", "Tempo", "SOS", "Rated opponents", "eFG%", "TO%", "ORB%", "FT rate", "3PA rate", "Adj eFG O%", "Adj eFG D%", "Adj TO O%", "Adj TO D%", "Adj ORB O%", "Adj ORB D%", "Adj FTR O%", "Adj FTR D%"],
                filtered.map((t) => [t.rank, t.name, t.wins, t.games, t.expected_wins, t.luck, t.adj_off, t.adj_def, t.adj_net, t.adj_tempo, t.sos, t.sos_games, t.efg == null ? null : t.efg * 100, t.tov_rate == null ? null : t.tov_rate * 100, t.orb_rate == null ? null : t.orb_rate * 100, t.ft_rate == null ? null : t.ft_rate * 100, t.three_rate == null ? null : t.three_rate * 100, t.adj_off_efg == null ? null : t.adj_off_efg * 100, t.adj_def_efg == null ? null : t.adj_def_efg * 100, t.adj_off_tov == null ? null : t.adj_off_tov * 100, t.adj_def_tov == null ? null : t.adj_def_tov * 100, t.adj_off_orb == null ? null : t.adj_off_orb * 100, t.adj_def_orb == null ? null : t.adj_def_orb * 100, t.adj_off_ftr == null ? null : t.adj_off_ftr * 100, t.adj_def_ftr == null ? null : t.adj_def_ftr * 100]),
              ),
            )
          }
        >
          Download CSV ↓
        </button>
      </div>
      <p className="note" style={{ marginBottom: 20 }}>
        Luck is actual wins minus model-expected wins, in percentage points,
        over the same paired box-score games. It is a descriptive variance
        signal, not a forecast or a claim that a team will regress.
      </p>
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
                "Expected W",
                "Luck",
                "eFG%",
                "TO%",
                "ORB%",
                "FT rate",
                "3PA rate",
                "Adj eFG O",
                "Adj eFG D",
                "Adj TO O",
                "Adj TO D",
                "Adj ORB O",
                "Adj ORB D",
                "Adj FTR O",
                "Adj FTR D",
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
                  t.expected_wins,
                  t.luck,
                  ...[
                    t.efg,
                    t.tov_rate,
                    t.orb_rate,
                    t.ft_rate,
                    t.three_rate,
                    t.adj_off_efg,
                    t.adj_def_efg,
                    t.adj_off_tov,
                    t.adj_def_tov,
                    t.adj_off_orb,
                    t.adj_def_orb,
                    t.adj_off_ftr,
                    t.adj_def_ftr,
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
