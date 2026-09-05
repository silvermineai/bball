"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  rateText,
  sortTeams,
  readProfile,
  type EfficiencyIndex,
  type EfficiencyProfile,
  type EfficiencyTeam,
  type Rate,
  type EfficiencyMetric,
} from "../../_lib/football-efficiency";
const day = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
function Cell({ rate, metric }: { rate: Rate; metric: EfficiencyMetric }) {
  return (
    <td className="numeric">
      <strong>{rateText(rate, metric)}</strong>
      <small>
        {rate.games} games · {rate.denominator.toLocaleString()} plays
      </small>
    </td>
  );
}
export default function EfficiencyDesk({ data }: { data: EfficiencyIndex }) {
  const initial =
    data.seasons.find((s) => s.season === 2025) || data.seasons[0];
  const [season, setSeason] = useState(initial.season),
    [scope, setScope] = useState<"all" | "fbs">("fbs"),
    [a, setA] = useState(""),
    [b, setB] = useState(""),
    [ready, setReady] = useState(false);
  const [q, setQ] = useState(""),
    [division, setDivision] = useState("fbs"),
    [min, setMin] = useState(5),
    [metric, setMetric] = useState("epa"),
    [side, setSide] = useState<"offense" | "defense">("offense"),
    [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [profile, setProfile] = useState<EfficiencyProfile | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [loading, setLoading] = useState(false);
  const release = data.seasons.find((s) => s.season === season)!;
  const candidates = sortTeams(
    release.teams.filter((t) => t.division === "fbs"),
    "fbs",
    "offense",
    "epa",
    "desc",
  );
  const teamA =
    release.teams.find((t) => t.id === a) || candidates[0] || release.teams[0];
  const teamB =
    release.teams.find((t) => t.id === b) ||
    candidates.find((t) => t.id !== teamA.id) ||
    release.teams[0];
  const m = data.metrics.find((m) => m.key === metric)!;
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const year = Number(p.get("season"));
    if (data.seasons.some((s) => s.season === year)) setSeason(year);
    if (p.get("scope") === "all") setScope("all");
    setA(p.get("a") || "");
    setB(p.get("b") || "");
    setQ(p.get("q") || "");
    if (["fbs", "fcs", "all"].includes(p.get("division") || ""))
      setDivision(p.get("division")!);
    if (p.has("min") && /^\d+$/.test(p.get("min")!))
      setMin(Math.min(20, Number(p.get("min"))));
    else if (year === 2026) setMin(0);
    if (data.metrics.some((m) => m.key === p.get("metric")))
      setMetric(p.get("metric")!);
    if (p.get("side") === "defense") setSide("defense");
    if (p.get("direction") === "asc") setDirection("asc");
    setReady(true);
  }, [data]);
  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams({
      season: String(season),
      scope,
      a: teamA.id,
      b: teamB.id,
      q,
      division,
      min: String(min),
      metric,
      side,
      direction,
    });
    history.replaceState(null, "", "?" + p.toString());
  }, [
    ready,
    season,
    scope,
    teamA.id,
    teamB.id,
    q,
    division,
    min,
    metric,
    side,
    direction,
  ]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setProfile(null);
    setError("");
    setLoading(true);
    readProfile(teamA, controller.signal)
      .then((p) => {
        if (!controller.signal.aborted) setProfile(p);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [ready, teamA.profile_hash, retry]);
  const rows = sortTeams(
    release.teams.filter(
      (t) =>
        (division === "all" || t.division === division) &&
        t.samples[scope].games >= min &&
        `${t.name} ${t.conference}`.toLowerCase().includes(q.toLowerCase()),
    ),
    scope,
    side,
    metric,
    direction,
  );
  const sampleA = teamA.samples[scope],
    sampleB = teamB.samples[scope];
  const currentProfile =
    profile?.id === teamA.id && profile.season === season ? profile : null;
  const logs =
    currentProfile?.games.filter(
      (g) => scope === "all" || g.opponent_division === "fbs",
    ) || [];
  return (
    <>
      <div className="toolbar efficiency-context">
        <label className="control">
          <span>STAT SEASON</span>
          <select
            value={season}
            onChange={(e) => {
              setSeason(Number(e.target.value));
              setMin(Number(e.target.value) === 2026 ? 0 : 5);
            }}
          >
            {data.seasons.map((s) => (
              <option key={s.season} value={s.season}>
                {s.season}
                {s.season === 2026 ? " · partial season" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>OPPONENT SAMPLE</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="fbs">FBS opponents only</option>
            <option value="all">All recorded opponents</option>
          </select>
        </label>
        <p>
          {release.games.toLocaleString()} games · {release.teams.length}{" "}
          represented teams
          <br />
          <small>
            Source downloaded {day(release.source_fetched_at)} · UTC
          </small>
        </p>
      </div>
      <p className="note">
        Descriptive, unadjusted statistics from covered finals. Opponent
        quality, roster changes and missing games can change the comparison.
        These rates do not modify the forecast model. “Allowed” uses the
        opponent’s offensive row from the same game.
      </p>
      <section aria-labelledby="efficiency-compare-title">
        <div className="section-heading">
          <h2 id="efficiency-compare-title">The matchup profile</h2>
          <button
            className="button secondary"
            onClick={() => {
              setA(teamB.id);
              setB(teamA.id);
            }}
          >
            Swap teams ⇄
          </button>
        </div>
        <div className="efficiency-teams">
          {[
            [teamA, sampleA, "A", setA],
            [teamB, sampleB, "B", setB],
          ].map(([t, s, label, setter]) => {
            const team = t as EfficiencyTeam;
            const sample = s as typeof sampleA;
            return (
              <div className="efficiency-team" key={String(label)}>
                <label className="control">
                  <span>TEAM {String(label)}</span>
                  <select
                    value={team.id}
                    onChange={(e) => (setter as typeof setA)(e.target.value)}
                  >
                    {[...release.teams]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
                <small>
                  {team.conference} · {team.division.toUpperCase()}
                </small>
                <div className="efficiency-numbers">
                  <div>
                    <strong>
                      {rateText(sample.offense.epa, data.metrics[0])}
                    </strong>
                    <span>OFFENSE EPA / PLAY</span>
                  </div>
                  <div>
                    <strong>
                      {rateText(sample.defense.epa, data.metrics[0])}
                    </strong>
                    <span>EPA / PLAY ALLOWED</span>
                  </div>
                </div>
                <p>
                  {sample.games} covered / {sample.scheduled_finals} scheduled
                  finals · {sample.paired_games} paired games
                </p>
                {sample.games < 5 && (
                  <p className="efficiency-caution">
                    Early sample: fewer than five games in this selection.
                  </p>
                )}
                <div
                  className="efficiency-playmix"
                  aria-label={`${team.name} pass play share ${rateText(sample.offense.pass_share, data.metrics.find((m) => m.key === "pass_share")!)}`}
                >
                  <span
                    style={{
                      width: `${Math.max(0, Math.min(100, (sample.offense.pass_share.value || 0) * 100))}%`,
                    }}
                  />
                </div>
                <small>
                  Pass play share{" "}
                  {rateText(
                    sample.offense.pass_share,
                    data.metrics.find((m) => m.key === "pass_share")!,
                  )}
                </small>
              </div>
            );
          })}
        </div>
        <div className="table-scroll">
          <table className="data-table efficiency-matrix">
            <caption>
              Same season and opponent filter for every column. Denominators
              vary by metric.
            </caption>
            <thead>
              <tr>
                <th>Measure</th>
                <th>
                  {teamA.name}
                  <small>Offense / own production</small>
                </th>
                <th>
                  {teamB.name}
                  <small>Allowed / opponent production</small>
                </th>
                <th>
                  {teamB.name}
                  <small>Offense / own production</small>
                </th>
                <th>
                  {teamA.name}
                  <small>Allowed / opponent production</small>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.metrics.map((m) => (
                <tr key={m.key}>
                  <th scope="row">
                    <details>
                      <summary>{m.label}</summary>
                      <p>{m.definition}</p>
                      <code>
                        {m.numerator} / {m.denominator}
                      </code>
                    </details>
                  </th>
                  <Cell rate={sampleA.offense[m.key]} metric={m} />
                  <Cell rate={sampleB.defense[m.key]} metric={m} />
                  <Cell rate={sampleB.offense[m.key]} metric={m} />
                  <Cell rate={sampleA.defense[m.key]} metric={m} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section
        className="efficiency-board"
        aria-labelledby="efficiency-board-title"
      >
        <div className="section-heading">
          <h2 id="efficiency-board-title">Find a team’s tendencies</h2>
          <span>{rows.length} matching teams</span>
        </div>
        <div className="toolbar">
          <label className="control">
            <span>TEAM OR CONFERENCE</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search programs"
            />
          </label>
          <label className="control">
            <span>TEAM DIVISION</span>
            <select
              value={division}
              onChange={(e) => setDivision(e.target.value)}
            >
              <option value="fbs">FBS</option>
              <option value="fcs">FCS</option>
              <option value="all">All represented teams</option>
            </select>
          </label>
          <label className="control">
            <span>MINIMUM COVERED GAMES</span>
            <select
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
            >
              {[
                0,
                1,
                3,
                5,
                10,
                ...(![0, 1, 3, 5, 10].includes(min) ? [min] : []),
              ].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="control">
            <span>MEASURE</span>
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {data.metrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="control">
            <span>ORDER BY</span>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as typeof side)}
            >
              <option value="offense">Own production</option>
              <option value="defense">Opponent production</option>
            </select>
          </label>
          <label className="control">
            <span>DIRECTION</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as typeof direction)}
            >
              <option value="desc">Highest first</option>
              <option value="asc">Lowest first</option>
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table efficiency-ranking">
            <thead>
              <tr>
                <th>Program</th>
                <th>Covered / finals</th>
                <th className="numeric">
                  {m.label}
                  <small>Own production</small>
                </th>
                <th className="numeric">
                  {m.label}
                  <small>Opponent production</small>
                </th>
                <th>Compare</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <th scope="row">
                    {t.name}
                    <small>{t.conference}</small>
                  </th>
                  <td>
                    {t.samples[scope].games} /{" "}
                    {t.samples[scope].scheduled_finals}
                  </td>
                  <Cell rate={t.samples[scope].offense[metric]} metric={m} />
                  <Cell rate={t.samples[scope].defense[metric]} metric={m} />
                  <td>
                    <button
                      onClick={() => {
                        setA(t.id);
                        document
                          .getElementById("efficiency-compare-title")
                          ?.scrollIntoView();
                      }}
                      aria-label={`Use ${t.name} as team A`}
                    >
                      Team A
                    </button>{" "}
                    ·{" "}
                    <button
                      onClick={() => {
                        setB(t.id);
                        document
                          .getElementById("efficiency-compare-title")
                          ?.scrollIntoView();
                      }}
                      aria-label={`Use ${t.name} as team B`}
                    >
                      Team B
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="empty">
            No teams match this sample. Lower the minimum or broaden the
            filters.
          </p>
        )}
      </section>
      <section
        className="efficiency-log"
        aria-labelledby="efficiency-log-title"
      >
        <div className="section-heading">
          <h2 id="efficiency-log-title">Inside {teamA.name}’s sample</h2>
          <a
            href={`/data/football/efficiency/profiles/${teamA.profile_hash}.json`}
            download
          >
            Download game evidence ↓
          </a>
        </div>
        <p>
          Use Team A above to inspect another program. Each record keeps the
          original team and opponent fields. Game dates are UTC; postseason week
          numbers can restart.
        </p>
        {loading && <p role="status">Loading game evidence…</p>}
        {error && (
          <div role="alert">
            <p>{error}</p>
            <button
              className="button secondary"
              onClick={() => setRetry((n) => n + 1)}
            >
              Retry evidence
            </button>
          </div>
        )}
        {!!sampleA.missing_games.length && (
          <details className="paper-panel">
            <summary>
              {sampleA.missing_games.length} scheduled finals without a team
              advanced row
            </summary>
            <ul>
              {sampleA.missing_games.map((g) => (
                <li key={g.id}>
                  {day(g.kickoff)} · {g.opponent} · Game {g.id}
                </li>
              ))}
            </ul>
          </details>
        )}
        {currentProfile && (
          <>
            <div className="table-scroll">
              <table className="data-table efficiency-games">
                <thead>
                  <tr>
                    <th>Game / phase</th>
                    <th>Opponent</th>
                    <th>Score</th>
                    <th className="numeric">EPA / play</th>
                    <th className="numeric">EPA / play allowed</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((g) => (
                    <tr key={g.game_id}>
                      <td>
                        {day(g.kickoff)}
                        <small>
                          {g.season_type} · {g.venue}
                        </small>
                      </td>
                      <th scope="row">
                        {g.opponent}
                        <small>{g.opponent_division.toUpperCase()}</small>
                      </th>
                      <td>
                        {g.team_score ?? "—"}–{g.opponent_score ?? "—"}
                        <small>
                          {g.included
                            ? "Included final"
                            : "Excluded: not a scored final"}
                        </small>
                      </td>
                      <Cell rate={g.offense.epa} metric={data.metrics[0]} />
                      <Cell rate={g.defense.epa} metric={data.metrics[0]} />
                      <td>
                        <details>
                          <summary>Source fields</summary>
                          <p>
                            Game {g.game_id} · values below are original source
                            strings.
                          </p>
                          <pre>
                            {JSON.stringify(
                              { team: g.raw, opponent: g.opponent_raw },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!logs.length && (
              <p className="empty">
                No recorded games for this opponent filter.
              </p>
            )}
          </>
        )}
      </section>
      <section className="paper-panel efficiency-method">
        <div className="eyebrow">Method / Totals before rates</div>
        <h2>Keep the denominator in view.</h2>
        <p>
          Season rates are sums of finite numerators divided by sums of their
          matching, positive denominators. A game missing either value is
          omitted for that metric. Zero opportunities produce an unavailable
          rate. Per-game EPA totals are already rounded by the source; these are
          not newly fitted EPA models.
        </p>
        <p>
          All-opponent samples can contain FCS and other divisions. FBS-only
          samples restrict the opponents, while the board’s division filter
          controls which teams are listed. Neither setting adjusts for opponent
          strength. Coverage counts refer to the imported schedule, not an
          independently verified census.
        </p>
        <p>
          Explosive plays and power rushes retain the publisher’s
          classification. First-down share is not down-and-distance success
          rate; line yards are not player grades. Special-teams production is
          separate from offensive EPA. College seasons use their starting year.
        </p>
        <a href={data.definitions_url}>Publisher field documentation ↗</a>
        <details>
          <summary>Source receipts and downloads</summary>
          {data.sources
            .filter((s) => s.season === season)
            .map((s) => (
              <p key={s.dataset}>
                <a href={s.url}>
                  {s.dataset} / {s.season} ↗
                </a>
                <br />
                Downloaded {s.fetched_at}
                <br />
                <code>SHA-256 {s.sha256}</code>
              </p>
            ))}
          <a href="/data/football/efficiency.json" download>
            Download comparison index ↓
          </a>
        </details>
        <Link href="/football/ratings/">
          Explore opponent-adjusted power ratings →
        </Link>
      </section>
    </>
  );
}
