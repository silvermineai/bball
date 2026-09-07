"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { date, fmt } from "../../_lib/format";
import {
  shotTypes,
  summarizeShots,
  onHalfCourt,
  type Shot,
  type ShotData,
  type ShotCatalog,
} from "../../_lib/shooting";

export default function Shooting({
  catalog,
  ratedTeamIds,
}: {
  catalog: ShotCatalog;
  ratedTeamIds: string[];
}) {
  const params = useSearchParams();
  const seasons = catalog.seasons ?? [catalog];
  const requestedSeason = Number(params.get("season"));
  const initialSeason = seasons.some((s) => s.season === requestedSeason)
    ? requestedSeason
    : (catalog.default_season ?? catalog.season);
  const [season, setSeason] = useState(initialSeason);
  const activeCatalog =
    seasons.find((s) => s.season === season) ?? seasons[0];
  const requestedPlayer = activeCatalog.players.find(
    (p) => p.id === params.get("player"),
  );
  const [team, setTeam] = useState(
    activeCatalog.teams.find((t) => t.id === params.get("team"))?.id ||
      requestedPlayer?.teams[0] ||
      "150",
  );
  const [player, setPlayer] = useState(
    requestedPlayer?.id || params.get("player") || "",
  );
  const [q, setQ] = useState("");
  const [data, setData] = useState<ShotData | null>(null),
    [error, setError] = useState("");
  const [matched, setMatched] = useState(true),
    [game, setGame] = useState("all"),
    [type, setType] = useState("all"),
    [selected, setSelected] = useState<Shot | null>(null);
  const kind = player ? "player" : "team",
    id = player || team;
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    setSelected(null);
    setGame("all");
    fetch(
      `/api/basketball/research/shooting/${kind}/${encodeURIComponent(id)}?season=${activeCatalog.season}`,
      { signal: c.signal },
    )
      .then((r) => {
        if (!r.ok)
          throw Error(
            r.status === 404
              ? "No imported shooting evidence for this selection."
              : "Shooting evidence is temporarily unavailable. Please reload.",
          );
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [kind, id, activeCatalog.season]);
  const people = activeCatalog.players.filter((p) => p.teams.includes(team));
  const results = people.filter((p) =>
    p.name.toLowerCase().includes(q.toLowerCase()),
  );
  const shots =
    data?.shots.filter(
      (s) =>
        (!matched || (kind === "team" ? s.team_match : s.player_match)) &&
        (game === "all" || s.game === game) &&
        (type === "all" || s.type === type),
    ) || [];
  const totals = summarizeShots(shots),
    plotted = shots.filter(onHalfCourt);
  const active =
    selected &&
    shots.some((s) => s.id === selected.id && s.game === selected.game)
      ? selected
      : null;
  return (
    <>
      <section className="section">
        <div className="toolbar shot-selectors">
          <label className="control">
            <span>PROGRAM</span>
            <select
              value={team}
              onChange={(e) => {
                setTeam(e.target.value);
                setPlayer("");
                setQ("");
              }}
            >
              {activeCatalog.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {seasons.length > 1 && (
            <label className="control">
              <span>SHOT SEASON</span>
              <select
                value={season}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setSeason(next);
                  const nextCatalog = seasons.find((s) => s.season === next);
                  setTeam(nextCatalog?.teams[0]?.id || "150");
                  setPlayer("");
                  setQ("");
                  const url = new URL(window.location.href);
                  url.searchParams.set("season", String(next));
                  url.searchParams.delete("player");
                  window.history.replaceState(null, "", url);
                }}
              >
                {seasons
                  .slice()
                  .sort((a, b) => b.season - a.season)
                  .map((entry) => (
                    <option key={entry.season} value={entry.season}>
                      {entry.season - 1}–{String(entry.season).slice(-2)} ·{" "}
                      {String(entry.coverage.shot_games ?? 0)} games
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="control">
            <span>FIND A PLAYER IN THIS PROGRAM</span>
            <input
              type="search"
              value={q}
              placeholder="Search historical personnel"
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="control">
            <span>SHOOTER</span>
            <select value={player} onChange={(e) => setPlayer(e.target.value)}>
              <option value="">Entire program</option>
              {results.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {fmt(p.all.attempts, 0)} attempts
                </option>
              ))}
              {player && !results.some((p) => p.id === player) && (
                <option value={player}>
                  {activeCatalog.players.find((p) => p.id === player)?.name ||
                    `Player ${player}`}
                </option>
              )}
            </select>
          </label>
        </div>
        {q && (
          <p className="note">
            {results.length} matching players in this program. Select a name
            under Shooter.
          </p>
        )}
        {error ? (
          <p role="alert" className="status-error">
            {error}
          </p>
        ) : !data ? (
          <p role="status" className="empty">
            Loading source shots and reconciliation checks…
          </p>
        ) : (
          <>
            <div className="section-heading">
              <div>
                <div className="eyebrow">
                  {player ? "Player evidence" : "Program evidence"} /{" "}
                  {activeCatalog.season - 1}–
                  {String(activeCatalog.season).slice(-2)}
                </div>
                <h2>{data.profile.name}</h2>
              </div>
              {(player || ratedTeamIds.includes(team)) && (
                <Link
                  href={
                    player
                      ? `/basketball/player/?id=${player}`
                      : `/basketball/programs/${team}/`
                  }
                >
                  {player ? "Player record" : "Program dossier"} →
                </Link>
              )}
            </div>
            {data.profile.teams.length > 1 && (
              <p className="note">
                This player has recorded attempts for multiple programs. The
                full-season view includes every listed affiliation; use a game
                filter to inspect one appearance.
              </p>
            )}
            <div className="toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={matched}
                  onChange={(e) => setMatched(e.target.checked)}
                />{" "}
                Box-score-matched games only
              </label>
              <label className="control">
                <span>GAME</span>
                <select value={game} onChange={(e) => setGame(e.target.value)}>
                  <option value="all">All recorded games</option>
                  {data.profile.games.map((g) => (
                    <option key={`${g.id}-${g.team}`} value={g.id}>
                      {date(g.date)} · {g.away} vs {g.home}
                      {g.matched ? "" : " · unmatched"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="control">
                <span>SHOT TYPE</span>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="all">All field goals</option>
                  {Object.entries(shotTypes).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="shot-coverage">
              {data.profile.games.filter((g) => g.matched).length} of{" "}
              {data.profile.games.length} shot-game samples match box totals ·{" "}
              {data.profile.box_games}{" "}
              {player ? "positive-attempt player" : "team"} box-score games in
              the warehouse.{" "}
              {matched
                ? "Showing only matching samples."
                : "Showing all imported attempts, including mismatches."}
            </p>
            <div className="shot-lab-grid">
              <div className="shot-court-panel">
                <div className="chart-legend">
                  <span>● Made</span>
                  <span>× Missed</span>
                  <small>Click or tap a shot to inspect</small>
                </div>
                <svg
                  viewBox="0 0 500 470"
                  className="shot-court"
                  aria-label={`Half-court shot locations for ${data.profile.name}`}
                >
                  <title>
                    Approximate shot locations. Equivalent event details are in
                    the table below.
                  </title>
                  <rect
                    x="1"
                    y="1"
                    width="498"
                    height="468"
                    fill="none"
                    stroke="var(--ink)"
                  />
                  <path
                    d="M170 0 V190 H330 V0 M190 0 V190 M310 0 V190 M170 190 A80 80 0 0 0 330 190 M190 190 A60 60 0 0 0 310 190 M220 40 H280 M33.6 0 V99.7 A221.46 221.46 0 0 0 466.4 99.7 V0"
                    fill="none"
                    stroke="var(--line)"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="250"
                    cy="52.5"
                    r="7.5"
                    fill="none"
                    stroke="var(--orange)"
                    strokeWidth="2"
                  />
                  <path
                    d="M190 469 A60 60 0 0 1 310 469"
                    fill="none"
                    stroke="var(--line)"
                  />
                  {plotted.map((s) => (
                    <g
                      key={`${s.game}-${s.id}`}
                      onClick={() => setSelected(s)}
                      className="shot-dot"
                      role="img"
                      aria-label={s.text}
                    >
                      <title>
                        {s.text} · period {s.period}, {s.clock}
                      </title>
                      {s.made ? (
                        <circle
                          cx={s.x! * 10}
                          cy={(s.y! + 5.25) * 10}
                          r={active?.id === s.id ? 6 : 3.2}
                          fill="var(--ink)"
                          opacity=".62"
                        />
                      ) : (
                        <path
                          d={`M${s.x! * 10 - 3},${(s.y! + 5.25) * 10 - 3} l6,6 m-6,0 l6,-6`}
                          stroke="var(--orange)"
                          strokeWidth="1.2"
                          opacity=".52"
                        />
                      )}
                    </g>
                  ))}
                </svg>
                <p className="note">
                  {fmt(plotted.length, 0)} plotted / {fmt(shots.length, 0)}{" "}
                  attempts in this selection.{" "}
                  {fmt(
                    shots.filter((s) => s.location_status !== "located").length,
                    0,
                  )}{" "}
                  lack a usable location;{" "}
                  {fmt(
                    shots.filter(
                      (s) => s.location_status === "located" && !onHalfCourt(s),
                    ).length,
                    0,
                  )}{" "}
                  are beyond half court.
                </p>
                <p className="chart-inspection" aria-live="polite">
                  {active
                    ? `${active.text} · period ${active.period}, ${active.clock}`
                    : "Select a plotted attempt or inspect an event in the table."}
                </p>
              </div>
              <div>
                <div className="shot-summary-grid">
                  <div>
                    <span>FIELD GOALS</span>
                    <strong>
                      {totals.made} / {totals.attempts}
                    </strong>
                  </div>
                  <div>
                    <span>FG%</span>
                    <strong>
                      {fmt(totals.fg == null ? null : totals.fg * 100)}
                    </strong>
                  </div>
                  <div>
                    <span>EFFECTIVE FG%</span>
                    <strong>
                      {fmt(totals.efg == null ? null : totals.efg * 100)}
                    </strong>
                  </div>
                  <div>
                    <span>FG POINTS / ATTEMPT</span>
                    <strong>
                      {fmt(
                        totals.attempts
                          ? totals.points / totals.attempts
                          : null,
                        2,
                      )}
                    </strong>
                  </div>
                </div>
                <h3>What kind of look?</h3>
                <p className="note">
                  Event labels, with makes and attempts. Percentages use every
                  selected attempt, including those omitted from the map.
                </p>
                <div className="shot-type-list">
                  {Object.entries(shotTypes).map(([key, label]) => {
                    const s = summarizeShots(
                      shots.filter((s) => s.type === key),
                    );
                    return (
                      <div key={key}>
                        <div>
                          <span>{label}</span>
                          <strong>
                            {s.made} / {s.attempts} ·{" "}
                            {fmt(s.fg == null ? null : s.fg * 100)}
                            {s.fg == null ? "" : "%"}
                          </strong>
                        </div>
                        <div className="shot-type-track">
                          <span
                            style={{
                              width: `${totals.attempts ? (s.attempts / totals.attempts) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="note">
                  Use shot mix to plan film review. This sample does not
                  identify the play call, defender, lineup, shot quality or
                  whether a player will be available next season.
                </p>
              </div>
            </div>
            {!shots.length && (
              <p className="empty">
                No attempts meet these filters. An unmatched game can be
                inspected by clearing the box-score check.
              </p>
            )}
            <ShotLog
              key={`${id}-${game}-${type}-${matched}`}
              shots={shots}
              games={data.profile.games}
              onInspect={setSelected}
            />
            <details className="shot-audit">
              <summary>Game coverage and reconciliation</summary>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Game</th>
                      <th>Recorded FG</th>
                      <th>Box-score check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.profile.games].reverse().map((g) => (
                      <tr key={`${g.id}-${g.team}`}>
                        <td>
                          {g.away} vs {g.home}
                          <small>{date(g.date)}</small>
                        </td>
                        <td>
                          {g.made} / {g.attempts}
                        </td>
                        <td>
                          {g.matched
                            ? "Matches all four totals"
                            : "Missing or conflicting totals"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>
    </>
  );
}
function ShotLog({
  shots,
  games,
  onInspect,
}: {
  shots: Shot[];
  games: ShotData["profile"]["games"];
  onInspect: (s: Shot) => void;
}) {
  const [page, setPage] = useState(0);
  const rows = shots.slice(page * 25, (page + 1) * 25);
  return (
    <section className="section">
      <div className="section-heading">
        <h2>Check the actual event.</h2>
        <span className="note">
          {fmt(shots.length, 0)} attempts · 25 per page
        </span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Game / clock</th>
              <th>Event</th>
              <th>Location</th>
              <th>Inspect</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const g = games.find((g) => g.id === s.game);
              return (
                <tr key={`${s.game}-${s.id}`}>
                  <td>
                    {g ? date(g.date) : s.game}
                    <small>
                      {g?.away} vs {g?.home}
                    </small>
                    <small>
                      Period {s.period} · {s.clock}
                    </small>
                  </td>
                  <td>
                    {s.text}
                    <small>
                      {s.inferred_value
                        ? "Attempt value recovered from explicit source score value"
                        : "Explicit attempt value"}
                    </small>
                  </td>
                  <td>
                    {s.location_status === "located"
                      ? onHalfCourt(s)
                        ? "Plotted"
                        : "Beyond half court"
                      : s.location_status.replaceAll("_", " ")}
                  </td>
                  <td>
                    <button
                      className="button secondary"
                      onClick={() => onInspect(s)}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button
          className="button secondary"
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page + 1} of {Math.max(1, Math.ceil(shots.length / 25))}
        </span>
        <button
          className="button secondary"
          disabled={(page + 1) * 25 >= shots.length}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
