"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { date, fmt, signed } from "../../_lib/format";
import type { ScoutProfile, SplitKey } from "../../_lib/scouting-types";
import { splitLabels } from "../../_lib/scouting-types";
import type { BBRoster } from "../../_lib/basketball-types";
import { buildRosterIntel } from "../../_lib/roster-intel";
import {
  scenarioQuery,
  scenarioVenue,
  type ScenarioVenue,
} from "../../_lib/scenario-location";
import {
  basketballScenario,
  type ScenarioModel,
} from "../../_lib/basketball-scenario";
const factors = [
  ["efg", "Shooting · eFG%"],
  ["tov", "Turnovers / possessions"],
  ["orb", "Offensive rebounding"],
  ["ftr", "Free-throw attempts / FGA"],
  ["two", "Two-point accuracy"],
  ["three", "Three-point accuracy"],
  ["three_rate", "Three-point attempt share"],
];
export default function Compare({
  teams,
  model,
  rosters,
}: {
  teams: { id: string; name: string }[];
  model: ScenarioModel;
  rosters: BBRoster[];
}) {
  const params = useSearchParams();
  const validId = (value: string | null) =>
    teams.some((t) => t.id === value) ? value! : null;
  const [a, setA] = useState(validId(params.get("a")) || teams[0].id),
    [b, setB] = useState(
      validId(params.get("b")) ||
        teams.find((t) => t.id !== (validId(params.get("a")) || teams[0].id))!
          .id,
    );
  const [venue, setVenue] = useState<ScenarioVenue>(
      scenarioVenue(params.get("venue")),
    ),
    [split, setSplit] = useState<SplitKey>("season"),
    [data, setData] = useState<[ScoutProfile, ScoutProfile] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const url = new URL(window.location.href);
    const query = new URLSearchParams(scenarioQuery(a, b, venue));
    for (const [key, value] of query) url.searchParams.set(key, value);
    window.history.replaceState(null, "", url);
  }, [a, b, venue]);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    if (a === b) return;
    Promise.all(
      [a, b].map((id) =>
        fetch(`/data/basketball/scouting/${id}.json`, {
          signal: c.signal,
        }).then((r) => {
          if (!r.ok)
            throw Error(
              "A program profile could not be loaded. Please reload.",
            );
          return r.json();
        }),
      ),
    )
      .then(([x, y]) => setData([x, y]))
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [a, b]);
  const homeId = venue === "b" ? b : a,
    awayId = venue === "b" ? a : b,
    p = basketballScenario(model, homeId, awayId, venue === "neutral");
  const an = teams.find((t) => t.id === a)!.name,
    bn = teams.find((t) => t.id === b)!.name;
  const intel =
    data?.map((profile) => buildRosterIntel(rosters, profile)) ?? [];
  const scoreA = p ? (venue === "b" ? p.away_score : p.home_score) : null,
    scoreB = p ? (venue === "b" ? p.home_score : p.away_score) : null,
    winA = p
      ? venue === "b"
        ? 1 - p.home_win_probability
        : p.home_win_probability
      : null;
  return (
    <>
      <div className="toolbar compare-controls">
        <label className="control">
          <span>PROGRAM A</span>
          <select value={a} onChange={(e) => setA(e.target.value)}>
            {[...teams]
              .sort((x, y) => x.name.localeCompare(y.name))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        <button
          className="button secondary swap-teams"
          aria-label="Swap programs"
          onClick={() => {
            setA(b);
            setB(a);
            setVenue(venue === "a" ? "b" : venue === "b" ? "a" : "neutral");
          }}
        >
          ⇄
        </button>
        <label className="control">
          <span>PROGRAM B</span>
          <select value={b} onChange={(e) => setB(e.target.value)}>
            {[...teams]
              .sort((x, y) => x.name.localeCompare(y.name))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        <label className="control">
          <span>SCENARIO VENUE</span>
          <select
            value={venue}
            onChange={(e) => setVenue(scenarioVenue(e.target.value))}
          >
            <option value="neutral">Neutral floor</option>
            <option value="a">{an} home</option>
            <option value="b">{bn} home</option>
          </select>
        </label>
      </div>
      {a === b ? (
        <p className="empty">Choose two different programs to compare.</p>
      ) : (
        <>
          {p && (
            <section className="scenario-board">
              <div>
                <div className="eyebrow">
                  Hypothetical matchup / published preseason model
                </div>
                <div className="scenario-score">
                  <div>
                    <Link href={`/basketball/programs/${a}/`}>{an}</Link>
                    <strong>{fmt(scoreA)}</strong>
                  </div>
                  <span>vs</span>
                  <div>
                    <Link href={`/basketball/programs/${b}/`}>{bn}</Link>
                    <strong>{fmt(scoreB)}</strong>
                  </div>
                </div>
              </div>
              <div className="scenario-detail">
                <p>
                  {an} win estimate <strong>{fmt(winA! * 100)}%</strong>
                </p>
                <p>
                  Total <strong>{fmt(p.total)}</strong>
                </p>
                <p>
                  Estimated pace <strong>{fmt(p.pace)}</strong>
                </p>
                <p>
                  {an} margin range · nominal 80%{" "}
                  <strong>
                    {venue === "b"
                      ? `${signed(-p.margin_high)} to ${signed(-p.margin_low)}`
                      : `${signed(p.margin_low)} to ${signed(p.margin_high)}`}
                  </strong>
                </p>
              </div>
            </section>
          )}
          <p className="note">
            This is a scenario estimate, not a scheduled game or a new
            forecast-ledger registration. It uses the published model as of{" "}
            {date(model.cutoff)}. The roster panel below is contextual evidence;
            roster, injury and recruiting inputs do not change this forecast.
            The historical split selector changes descriptive stats only.{" "}
            <Link href="/basketball/model/">
              Model assumptions and validation →
            </Link>
          </p>
          {error ? (
            <p role="alert" className="status-error">
              {error}
            </p>
          ) : !data ? (
            <p role="status" className="empty">
              Loading both program dossiers…
            </p>
          ) : (
            <>
              <section className="section">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">01 / Roster construction</div>
                    <h2>Know what the source lists.</h2>
                  </div>
                  <Link href="/basketball/recruiting/">
                    Open recruiting evidence →
                  </Link>
                </div>
                <p className="note">
                  The 2026–27 roster view is a source-listed observation, not a
                  confirmed depth chart. Returning and movement counts are
                  grouped by publisher athlete ID; an absent player is not
                  treated as a departure. Prior minutes are historical context
                  only and do not change this forecast.
                </p>
                <div className="two-col">
                  {intel.map((team) => (
                    <div className="paper-panel roster-intel" key={team.teamId}>
                      <h3>{team.teamName}</h3>
                      <p>
                        <strong>{team.observed}</strong> source-listed players ·{" "}
                        {team.returning} returning by prior-program match
                      </p>
                      <div className="roster-intel-stats">
                        <span>
                          <strong>{team.transfers}</strong>
                          <small>different program</small>
                        </span>
                        <span>
                          <strong>{team.newToDataset}</strong>
                          <small>new to dataset</small>
                        </span>
                        <span>
                          <strong>{team.ambiguous}</strong>
                          <small>ambiguous</small>
                        </span>
                      </div>
                      <h4>Movement to investigate</h4>
                      {team.movement.length ? (
                        <ul className="roster-intel-list">
                          {team.movement.slice(0, 5).map((player) => (
                            <li key={player.id}>
                              <span>
                                <strong>{player.name}</strong>
                                <small>
                                  {player.status === "different_program"
                                    ? player.previous_teams.join(", ") ||
                                      "Different program"
                                    : player.status === "new_to_dataset"
                                      ? "No prior appearance observed"
                                      : "Multiple current programs"}
                                </small>
                              </span>
                              <span>
                                {player.priorPlayer
                                  ? `${fmt(player.priorPlayer.mpg)} min/g`
                                  : "No prior log"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="note">
                          No movement records in this source view.
                        </p>
                      )}
                      {team.movement.length > 5 && (
                        <small className="roster-intel-more">
                          +{team.movement.length - 5} more listed records in the
                          recruiting view.
                        </small>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <section className="section">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">02 / Attack meets resistance</div>
                    <h2>Compare both ends.</h2>
                  </div>
                  <label className="control">
                    <span>HISTORICAL WINDOW</span>
                    <select
                      value={split}
                      onChange={(e) => setSplit(e.target.value as SplitKey)}
                    >
                      {(["season", "last10", "last5"] as SplitKey[]).map(
                        (k) => (
                          <option key={k} value={k}>
                            {splitLabels[k]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
                <p className="note">
                  2025–26 unadjusted observations. These rates describe
                  different schedules and are not head-to-head forecasts. Each
                  value includes its own sample count.
                </p>
                <div className="table-scroll">
                  <table className="data-table comparison-table">
                    <thead>
                      <tr>
                        <th>Factor</th>
                        <th>{an} offense</th>
                        <th>{bn} defense</th>
                        <th>{bn} offense</th>
                        <th>{an} defense</th>
                      </tr>
                    </thead>
                    <tbody>
                      {factors.map(([key, label]) => (
                        <tr key={key}>
                          <th>{label}</th>
                          {[
                            [0, "off"],
                            [1, "def"],
                            [1, "off"],
                            [0, "def"],
                          ].map(([i, side]) => {
                            const m =
                              data[i as number].splits[split].metrics[
                                `${side}_${key}`
                              ];
                            return (
                              <td key={i + String(side)}>
                                {m.value === null
                                  ? "—"
                                  : fmt(m.value * 100) + "%"}
                                <small>{m.games} games</small>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="two-col" style={{ marginTop: 24 }}>
                  {data.map((team) => (
                    <div className="paper-panel" key={team.id}>
                      <h3>{team.name}</h3>
                      <p>
                        {team.splits[split].wins}–{team.splits[split].losses}{" "}
                        over {team.splits[split].games} games · pace{" "}
                        {fmt(team.splits[split].pace)}
                      </p>
                      <p>
                        Mean current opponent adj. net:{" "}
                        {fmt(team.splits[split].sos)} over{" "}
                        {team.splits[split].sos_games} rated opponents.
                      </p>
                      <Link href={`/basketball/programs/${team.id}/`}>
                        Open the full dossier →
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
              <section className="section">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">03 / Start with the rotation</div>
                    <h2>Who carried the workload?</h2>
                  </div>
                </div>
                <p className="note">
                  Top five by recorded 2025–26 minutes; historical affiliations,
                  not a confirmed current rotation.
                </p>
                <div className="two-col">
                  {data.map((team) => (
                    <div className="paper-panel" key={team.id}>
                      <h3>{team.name}</h3>
                      {team.players.slice(0, 5).map((player) => (
                        <div className="personnel-row" key={player.id}>
                          <Link href={`/basketball/player/?id=${player.id}`}>
                            {player.name}
                            <small>
                              {player.position || "—"} · {fmt(player.mpg)}{" "}
                              min/game
                            </small>
                          </Link>
                          <span>
                            {fmt(player.ppg)} PPG
                            <small>
                              {player.usage_est == null
                                ? "Usage unavailable"
                                : fmt(player.usage_est * 100) +
                                  "% est. usage"}{" "}
                              · {player.usage_games ?? 0} games
                            </small>
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
              <section className="section paper-panel">
                <h2>Build the film assignment.</h2>
                <p>
                  Use shooting and turnover rates to identify questions about
                  ball pressure and shot creation. Use offensive-rebound rates
                  to assign box-out responsibilities. Use free-throw attempt
                  rates to examine contact and foul exposure. Confirm the
                  expected personnel before translating last season’s evidence
                  into a game plan.
                </p>
                <p>
                  The comparison does not establish which scheme caused a
                  statistic or which player will be available.{" "}
                  <Link href="/basketball/recruiting/">
                    Check roster observations
                  </Link>{" "}
                  and{" "}
                  <Link href="/research/scorecard/?sport=basketball">
                    follow registered game forecasts
                  </Link>{" "}
                  separately.
                </p>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
