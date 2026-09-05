"use client";
import { useState } from "react";
import Link from "next/link";
import { date, fmt } from "../../../_lib/format";
import {
  fourFactors,
  splitLabels,
  type ScoutProfile,
  type SplitKey,
} from "../../../_lib/scouting-types";
import EfficiencyChart from "./EfficiencyChart";
const prompts: Record<string, string> = {
  off_efg:
    "Which actions create the team's efficient looks, and which personnel can reproduce them?",
  def_efg:
    "What coverages and lineups account for the shot quality opponents receive?",
  off_tov:
    "Where do turnovers occur under pressure, and who can relieve that pressure?",
  def_tov:
    "Which defensive actions produce takeaways, and what shots do they concede?",
  off_orb:
    "Who crashes the glass, and how does that affect transition defense?",
  def_orb: "Which matchups demand an extra box-out assignment?",
  off_ftr:
    "Who generates contact, and how do opponents keep them off the line?",
  def_ftr:
    "Which defenders can protect the paint without surrendering free throws?",
};
export default function Dossier({ profile: p }: { profile: ScoutProfile }) {
  const [split, setSplit] = useState<SplitKey>("season"),
    [qualified, setQualified] = useState(true),
    [playerSort, setPlayerSort] = useState("minutes");
  const s = p.splits[split];
  const games =
    split === "season"
      ? p.games
      : split === "last10"
        ? p.games.slice(-10)
        : split === "last5"
          ? p.games.slice(-5)
          : split === "top50"
            ? p.games.filter(
                (g) => g.opponent_rank !== null && g.opponent_rank <= 50,
              )
            : p.games.filter((g) => g.location === split);
  const players = p.players
    .filter((p) => !qualified || p.minutes >= 200)
    .sort((a, b) => {
      const k = playerSort as "minutes" | "ppg" | "usage_est" | "ts";
      return (b[k] ?? -1) - (a[k] ?? -1);
    });
  const ranked = fourFactors
    .filter((k) => p.splits.season.metrics[k].percentile != null)
    .sort(
      (a, b) =>
        p.splits.season.metrics[b].percentile! -
        p.splits.season.metrics[a].percentile!,
    );
  const angles = [...ranked.slice(0, 2), ...ranked.slice(-2)].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  return (
    <>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">01 / Both ends of the floor</div>
            <h2>The possession profile.</h2>
          </div>
          <label className="control">
            <span>STATISTICAL WINDOW</span>
            <select
              value={split}
              onChange={(e) => setSplit(e.target.value as SplitKey)}
            >
              {Object.entries(splitLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="scout-split-note">
          <strong>
            {s.wins}–{s.losses}
            {s.ties ? `–${s.ties}` : ""}
          </strong>
          <span>
            {s.games} recorded games · {s.paired_games} paired efficiency
            samples · pace {fmt(s.pace)}
          </span>
          <span>
            Mean opponent adj. net {fmt(s.sos)} · {s.sos_games} rated opponents
          </span>
        </div>
        <div className="factor-grid">
          {fourFactors.map((key) => {
            const m = s.metrics[key],
              def = p.metrics[key];
            return (
              <div className="factor-card" key={key}>
                <div className="eyebrow">
                  {key.startsWith("off") ? "Offense" : "Defense"}
                </div>
                <h3>{def.label}</h3>
                <strong>
                  {m.value === null ? "—" : fmt(m.value * 100) + "%"}
                </strong>
                <small>
                  {m.games} games · {def.higher_better ? "higher" : "lower"} is
                  better
                </small>
                {split === "season" && m.rank != null ? (
                  <>
                    <div className="percentile-track" aria-hidden="true">
                      <span style={{ width: `${m.percentile}%` }} />
                    </div>
                    <small>
                      Rank {m.rank} / {m.population} · {fmt(m.percentile, 0)}th
                      favorable percentile
                    </small>
                  </>
                ) : (
                  <p className="note">{def.description}</p>
                )}
              </div>
            );
          })}
        </div>
        <details className="scout-shooting">
          <summary>Shooting and ball-movement detail</summary>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="numeric">Observed rate</th>
                  <th className="numeric">Games</th>
                  <th>Definition</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(p.metrics)
                  .filter(([key]) => !fourFactors.includes(key))
                  .map(([key, def]) => (
                    <tr key={key}>
                      <td>{def.label}</td>
                      <td className="numeric">
                        {fmt(
                          s.metrics[key].value === null
                            ? null
                            : s.metrics[key].value! *
                                (def.format === "percent" ? 100 : 1),
                        )}
                        {s.metrics[key].value !== null &&
                        def.format === "percent"
                          ? "%"
                          : ""}
                      </td>
                      <td className="numeric">{s.metrics[key].games}</td>
                      <td>
                        <span className="note">{def.description}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
        <p className="note">
          Window changes describe the historical sample; they do not refit the
          preseason model. Full-season ranks require 10 games. Percentiles
          compare qualifying programs in the model’s rated field. Source
          coverage can differ by metric.
        </p>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">02 / The film queue</div>
            <h2>Turn a number into a question.</h2>
          </div>
          <span className="note">
            Full-season relative strengths and watch points
          </span>
        </div>
        <div className="scouting-questions">
          {angles.map((key, i) => {
            const m = p.splits.season.metrics[key];
            return (
              <article className="paper-panel" key={key}>
                <div className="eyebrow">
                  {i < 2 ? "A relative strength" : "A closer look"}
                </div>
                <h3>{p.metrics[key].label}</h3>
                <p>
                  {fmt(m.value! * 100)}% · rank {m.rank} of {m.population} ·{" "}
                  {m.games} games
                </p>
                <p>{prompts[key]}</p>
              </article>
            );
          })}
        </div>
        <p className="note">
          These are stat-led film prompts, not verified explanations of a
          scheme. Lower-ranked factors can still be above average. A
          five-point-or-closer final occurred {s.close_games} times in the
          selected window; {p.name} won {s.close_wins}. That small-sample record
          is not a clutch-skill estimate.
        </p>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">03 / How the season moved</div>
            <h2>Read beyond the average.</h2>
          </div>
        </div>
        <EfficiencyChart key={split} games={games} />
        <details>
          <summary>
            Open the game-by-game scouting log · {games.length} games
          </summary>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Game / venue</th>
                  <th>Result</th>
                  <th>Current opponent rank</th>
                  <th>Off. eff.</th>
                  <th>Def. eff.</th>
                  <th>Pace</th>
                  <th>eFG%</th>
                  <th>TO%</th>
                  <th>ORB%</th>
                </tr>
              </thead>
              <tbody>
                {[...games].reverse().map((g) => (
                  <tr key={g.id}>
                    <td>
                      {g.opponent_rank ? (
                        <Link href={`/basketball/programs/${g.opponent_id}/`}>
                          {g.opponent}
                        </Link>
                      ) : (
                        g.opponent
                      )}
                      <small>
                        {date(g.starts_at)} · {g.location}
                      </small>
                    </td>
                    <td>
                      {g.result || "—"} {g.score ?? "—"}–{g.allowed ?? "—"}
                    </td>
                    <td>{g.opponent_rank ?? "Unrated"}</td>
                    <td>{fmt(g.rates.off_eff)}</td>
                    <td>{fmt(g.rates.def_eff)}</td>
                    <td>{fmt(g.pace)}</td>
                    {["off_efg", "off_tov", "off_orb"].map((k) => (
                      <td key={k}>
                        {fmt(g.rates[k] == null ? null : g.rates[k] * 100)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              04 / The people behind the possessions
            </div>
            <h2>Personnel and workload.</h2>
          </div>
          <Link href="/basketball/players/">Full player index →</Link>
        </div>
        <p className="note">
          2025–26 recorded affiliations, independent of the split selector. This
          is not a confirmed 2026–27 roster.{" "}
          <Link href="/basketball/recruiting/">
            Inspect roster observations →
          </Link>
        </p>
        <div className="toolbar">
          <label>
            <input
              type="checkbox"
              checked={qualified}
              onChange={(e) => setQualified(e.target.checked)}
            />{" "}
            At least 200 recorded minutes
          </label>
          <label className="control">
            <span>SORT PERSONNEL</span>
            <select
              value={playerSort}
              onChange={(e) => setPlayerSort(e.target.value)}
            >
              <option value="minutes">Total minutes</option>
              <option value="ppg">Points per game</option>
              <option value="usage_est">Estimated usage</option>
              <option value="ts">True shooting</option>
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>GP</th>
                <th>MIN/G</th>
                <th>PTS/G</th>
                <th>REB/G</th>
                <th>AST/G</th>
                <th>TS%</th>
                <th>Est. usage</th>
                <th>Usage games</th>
                <th>AST/TO</th>
                <th>3PA</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td>
                    <Link href={`/basketball/player/?id=${player.id}`}>
                      {player.name}
                    </Link>
                    <small>{player.position || "—"}</small>
                  </td>
                  <td>{player.games}</td>
                  <td>{fmt(player.mpg)}</td>
                  <td>{fmt(player.ppg)}</td>
                  <td>{fmt(player.rpg)}</td>
                  <td>{fmt(player.apg)}</td>
                  <td>{fmt(player.ts === null ? null : player.ts * 100)}</td>
                  <td>
                    {player.usage_est == null
                      ? "—"
                      : fmt(player.usage_est * 100) + "%"}
                  </td>
                  <td>{player.usage_games ?? 0}</td>
                  <td>
                    {fmt(player.assist_turnover_ratio, 2)}
                    <small>{player.assist_turnover_games ?? 0} games</small>
                  </td>
                  <td>
                    {player.three_attempts ?? "—"}
                    <small>{player.three_attempt_games ?? 0} games</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!players.length && (
          <p className="empty">
            No imported players meet this workload filter.
          </p>
        )}
        <p className="note">
          Usage is a minutes-based estimate over the stated sample, not a direct
          measure of on-court possessions. Low-minute estimates are noisy.
          AST/TO is unavailable when recorded turnovers are zero; missing fields
          are never filled with zero.
        </p>
      </section>
    </>
  );
}
