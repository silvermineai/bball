"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  unitQuestions,
  type FootballBriefEvidence,
} from "../_lib/football-brief";
import {
  rateText,
  type Rate,
  type EfficiencyMetric,
} from "../_lib/football-efficiency";
import { fmt, date } from "../_lib/format";

function RateCell({
  rate,
  metric,
}: {
  rate: Rate | undefined;
  metric: EfficiencyMetric;
}) {
  return (
    <td className="numeric">
      <strong>{rateText(rate, metric)}</strong>
      <small>
        {rate?.value == null
          ? "Not available"
          : `${rate.games} games · ${rate.denominator.toLocaleString()} recorded plays`}
      </small>
    </td>
  );
}
export default function FootballMatchupEvidence({
  data,
}: {
  data: FootballBriefEvidence;
}) {
  const [season, setSeason] = useState(data.seasons[0]?.season),
    [scope, setScope] = useState<"fbs" | "all">("fbs");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const year = Number(params.get("stats"));
    if (data.seasons.some((s) => s.season === year)) setSeason(year);
    if (params.get("scope") === "all") setScope("all");
  }, [data.seasons]);
  function select(year: number, sample: "fbs" | "all") {
    setSeason(year);
    setScope(sample);
    const url = new URL(window.location.href);
    url.searchParams.set("stats", String(year));
    url.searchParams.set("scope", sample);
    window.history.replaceState(null, "", url);
  }
  const release = data.seasons.find((s) => s.season === season);
  const [away, home] = data.programs;
  const compare = `/football/efficiency/?${new URLSearchParams({ season: String(season), a: away.id, b: home.id, scope })}`;
  return (
    <>
      <section className="section football-units" aria-labelledby="unit-title">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              The unit matchup / Descriptive evidence
            </div>
            <h2 id="unit-title">Put the production side by side.</h2>
          </div>
          <Link href={compare}>Open the efficiency desk →</Link>
        </div>
        <p className="note">
          Play-weighted source rates against each team’s own opponents. These
          are unadjusted historical observations, not a head-to-head forecast or
          a new input to the score model. Defensive figures describe opponent
          production; lower EPA allowed is better.
        </p>
        <div className="toolbar football-evidence-controls">
          <label className="control">
            <span>TEAM STAT SEASON</span>
            <select
              value={season}
              onChange={(e) => select(+e.target.value, scope)}
            >
              {data.seasons.map((s) => (
                <option key={s.season} value={s.season}>
                  {s.season}
                  {s.season === data.playerSeason
                    ? " · Prior season"
                    : " · Partial current season"}
                </option>
              ))}
            </select>
          </label>
          <label className="control">
            <span>OPPONENT SAMPLE</span>
            <select
              value={scope}
              onChange={(e) => select(season, e.target.value as "fbs" | "all")}
            >
              <option value="fbs">FBS opponents only</option>
              <option value="all">All recorded opponents</option>
            </select>
          </label>
        </div>
        <p className="note" role="status">
          {season} team statistics ·{" "}
          {scope === "fbs" ? "FBS opponents only" : "All recorded opponents"} ·
          Source retrieved {release ? date(release.retrieved) : "not available"}
          .
          {season !== data.playerSeason &&
            " Early-season samples are incomplete and may contain only one game."}
        </p>
        <div className="football-unit-grid">
          {[0, 1].map((offenseIndex) => {
            const defenseIndex = 1 - offenseIndex;
            const offense = data.programs[offenseIndex],
              defense = data.programs[defenseIndex];
            const a = release?.teams[offenseIndex]?.samples[scope],
              b = release?.teams[defenseIndex]?.samples[scope];
            return (
              <section
                className="football-unit"
                key={offense.id}
                aria-label={`${offense.name} offense against ${defense.name} defense`}
              >
                <div className="eyebrow">When {offense.name} has the ball</div>
                <h3>
                  {offense.name} <span>vs</span> {defense.name}
                </h3>
                <div className="table-scroll">
                  <table className="data-table">
                    <caption className="sr-only">
                      {season}{" "}
                      {scope === "fbs" ? "FBS opponent" : "all opponent"} unit
                      production
                    </caption>
                    <thead>
                      <tr>
                        <th>Measure</th>
                        <th>
                          {offense.name}
                          <small>Offense produced</small>
                        </th>
                        <th>
                          {defense.name}
                          <small>Defense allowed</small>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {unitQuestions.map((q) => {
                        const metric = data.metrics.find(
                          (m) => m.key === q.key,
                        )!;
                        return (
                          <tr key={q.key}>
                            <th scope="row">{metric.label}</th>
                            <RateCell
                              rate={a?.offense[q.key]}
                              metric={metric}
                            />
                            <RateCell
                              rate={b?.defense[q.key]}
                              metric={metric}
                            />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="football-sample">
                  <p>
                    <strong>{offense.name}:</strong>{" "}
                    {a
                      ? `${a.games} team records from ${a.scheduled_finals} scheduled finals; ${a.missing_games.length} finals missing team data.`
                      : "No team records in this season."}
                  </p>
                  <p>
                    <strong>{defense.name}:</strong>{" "}
                    {b
                      ? `${b.paired_games} games with opponent records from ${b.scheduled_finals} scheduled finals.`
                      : "No opponent records in this season."}
                  </p>
                  <p>
                    Each measure uses its own available plays. A missing rate is
                    not zero. Stuffed-run share uses source-classified stuffed
                    carries; higher is better for the defense.
                  </p>
                </div>
              </section>
            );
          })}
        </div>
        <details className="football-definitions">
          <summary>Metric definitions and film questions</summary>
          {unitQuestions.map((q) => {
            const m = data.metrics.find((m) => m.key === q.key)!;
            return (
              <div key={q.key}>
                <h3>{m.label}</h3>
                <p>{m.definition}</p>
                <p>
                  <strong>On film:</strong> {q.question}
                </p>
              </div>
            );
          })}
        </details>
        <div className="football-evidence-links">
          {release?.teams.map(
            (t, i) =>
              t && (
                <a
                  key={t.id}
                  href={`/data/football/efficiency/profiles/${t.profile_hash}.json`}
                >
                  Download {data.programs[i].name} game evidence ↗
                </a>
              ),
          )}
        </div>
      </section>
      <section
        className="section football-personnel"
        aria-labelledby="personnel-title"
      >
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              Historical personnel / {data.playerSeason}
            </div>
            <h2 id="personnel-title">Who supplied the production?</h2>
          </div>
          <Link href={`/football/players/?season=${data.playerSeason}`}>
            Explore player rankings →
          </Link>
        </div>
        <p className="note">
          Up to two qualified players per program and category, ordered by total
          source EPA. Minimums: 100 passing, 50 rushing or 30 receiving plays.
          These {data.playerSeason} affiliations do not verify current rosters,
          eligibility, availability or starting roles. Player totals include all
          their recorded opponents and do not follow the team-sample filter
          above. Never add EPA across overlapping categories.
        </p>
        <div className="football-unit-grid">
          {data.programs.map((program) => (
            <section
              className="football-unit"
              key={program.id}
              aria-label={`${program.name} historical personnel`}
            >
              <h3>{program.name}</h3>
              {program.personnel.length ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Player / category</th>
                        <th>Plays</th>
                        <th>Total EPA</th>
                        <th>EPA / play</th>
                      </tr>
                    </thead>
                    <tbody>
                      {program.personnel.map((row) => (
                        <tr key={`${row.player.id}:${row.category}`}>
                          <th scope="row">
                            <Link
                              href={`/football/player/?${new URLSearchParams({ id: row.player.id, season: String(row.player.season) })}`}
                            >
                              {row.player.name}
                            </Link>
                            <small>
                              {row.category} · FBS rank {row.production.rank}
                            </small>
                          </th>
                          <td className="numeric">
                            {fmt(row.production.plays, 0)}
                          </td>
                          <td className="numeric">
                            {fmt(row.production.epa, 2)}
                          </td>
                          <td className="numeric">
                            {fmt(row.production.epa_per_play, 3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="note">
                  No qualified player records in the linked {data.playerSeason}{" "}
                  release. This does not establish an absence of production.
                </p>
              )}
            </section>
          ))}
        </div>
      </section>
      <details className="football-definitions football-provenance">
        <summary>Source receipts and linked data editions</summary>
        <p>
          SportsDataverse bulk releases, publisher-stated CC BY 4.0. Silvermine
          aggregates the team rates and selects historical player leaders.
          Neither collection time nor this brief’s publication is backdated to
          the games described.
        </p>
        <p>
          Team edition: <code>{data.efficiencyEdition}</code>
        </p>
        <p>
          Player catalog edition: <code>{data.playerEdition}</code>
        </p>
        <p>
          <a href={`/data/football/${data.playerFile}`}>
            Download {data.playerSeason} player statistics ↗
          </a>{" "}
          · SHA-256: <code>{data.playerSha256}</code>
        </p>
        <ul>
          {data.sources.map((s, i) => (
            <li key={`${s.dataset}:${s.season}:${i}`}>
              <a href={s.url}>
                {s.season} / {s.dataset}
              </a>{" "}
              · Retrieved {s.fetched_at}
              <br />
              <code>{s.sha256}</code>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
