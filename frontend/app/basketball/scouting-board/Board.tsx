"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fmt } from "../../_lib/format";
import { seasonLabel, type CareerCatalog } from "../../_lib/careers";
import {
  comparisonParams,
  selectionKey,
  validateSeason,
  type SeasonPlayers,
} from "../../_lib/player-comparison";
import {
  boardMetrics,
  boardParams,
  readBoard,
  buildBoard,
  filterBoard,
  boardCsv,
  presets,
  toWeights,
  type BoardState,
} from "../../_lib/scouting-board";
export default function Board({ catalog }: { catalog: CareerCatalog }) {
  const params = useSearchParams();
  const state = readBoard(
    new URLSearchParams(params.toString()),
    catalog.seasons.map((s) => s.season),
  );
  const { season, weights, query, position, minimumMinutes, selected } = state;
  const [data, setData] = useState<SeasonPlayers | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [page, setPage] = useState(0),
    [copied, setCopied] = useState("");
  const cache = useRef(new Map<number, SeasonPlayers>());
  const coverage = catalog.seasons.find((s) => s.season === season);
  useEffect(() => {
    const c = new AbortController();
    setError("");
    setData(null);
    if (!catalog.seasons.some((s) => s.season === season)) return;
    const accept = (value: SeasonPlayers) => {
      validateSeason(value, season, catalog);
      if (!c.signal.aborted) {
        cache.current.set(season, value);
        setData(value);
      }
    };
    if (cache.current.has(season)) {
      try {
        accept(cache.current.get(season)!);
      } catch (e) {
        setError((e as Error).message);
      }
    } else
      fetch(`/data/basketball/history/players-${season}.json`, {
        signal: c.signal,
      })
        .then(async (r) => {
          if (!r.ok)
            throw Error(
              "Player statistics could not be loaded. Retry the archive download.",
            );
          accept(await r.json());
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        });
    return () => c.abort();
  }, [season, catalog, retry]);
  useEffect(() => {
    setPage(0);
    setCopied("");
  }, [params]);
  const ready = data?.season === season ? data : null;
  const signature = boardMetrics.map((m) => weights[m.key]).join(",");
  const board = useMemo(
    () =>
      buildBoard(
        ready?.players || [],
        season,
        toWeights(signature.split(",").map(Number)),
      ),
    [ready, season, signature],
  );
  const filtered = filterBoard(board.rows, query, position, minimumMinutes);
  const positions = [
    ...new Set(board.rows.map((r) => r.player.position || "Unknown")),
  ].sort();
  const picks = selected
    .map((key) => board.rows.find((r) => selectionKey(r.player) === key))
    .filter((r) => r !== undefined);
  const missingPicks = ready ? selected.length - picks.length : 0;
  const preset = Object.values(presets).find(
    (p) => p.weights.join(",") === signature,
  );
  const update = (patch: Partial<BoardState>, replace = false) => {
    const url = new URL(window.location.href);
    url.search = boardParams({ ...state, ...patch, invalid: false });
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
  };
  const download = () => {
    if (!ready) return;
    const url = URL.createObjectURL(
      new Blob([boardCsv(filtered, weights, ready.edition, board.peerCounts)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `basketball-scouting-board-${season}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Board link copied.");
    } catch {
      setCopied("Copy this page’s address to share your board.");
    }
  };
  return (
    <>
      <section className="board-priorities" aria-label="Scouting priorities">
        <div className="section-heading">
          <div>
            <div className="eyebrow">01 / Set the brief</div>
            <h2>Start with a priority.</h2>
          </div>
          <span className="board-mode">
            {preset?.label || "Custom weights"}
          </span>
        </div>
        <div className="board-presets">
          {Object.entries(presets).map(([key, p]) => (
            <button
              key={key}
              aria-pressed={preset === p}
              onClick={() => update({ weights: toWeights(p.weights) })}
            >
              <strong>{p.label}</strong>
              <span>{p.description}</span>
            </button>
          ))}
        </div>
        <details className="board-weights">
          <summary>Adjust all eight weights</summary>
          <p className="note">
            Weights are relative: each is divided by their sum. Zero excludes a
            metric. All-zero weights withhold scores. Presets are editorial
            starting points, not fitted or validated talent models.
          </p>
          <div className="board-weight-grid">
            {boardMetrics.map((m) => (
              <label key={m.key}>
                <span>
                  {m.label}
                  {m.key === "topg" ? " · fewer is better" : ""}
                </span>
                <div>
                  <input
                    aria-label={`${m.label} weight`}
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={weights[m.key]}
                    onChange={(e) =>
                      update(
                        { weights: { ...weights, [m.key]: +e.target.value } },
                        true,
                      )
                    }
                  />
                  <output>{weights[m.key]}</output>
                </div>
                <small>
                  {board.sum ? fmt((100 * weights[m.key]) / board.sum, 1) : "0"}
                  % of score
                </small>
              </label>
            ))}
          </div>
        </details>
      </section>
      {state.invalid && (
        <p role="alert" className="status-error">
          Some link settings were invalid. Unsupported seasons are withheld;
          invalid weights or minute filters use the displayed defaults. Invalid
          shortlist entries were omitted.
        </p>
      )}
      <section className="section" aria-label="Player results">
        <div className="section-heading">
          <div>
            <div className="eyebrow">02 / Read the production</div>
            <h2>Find the players behind the numbers.</h2>
          </div>
          <button className="button secondary" onClick={share}>
            Copy board link
          </button>
        </div>
        {copied && <p role="status">{copied}</p>}
        <div className="toolbar board-filters">
          <label className="control">
            <span>STAT SEASON</span>
            <select
              value={season}
              onChange={(e) =>
                update({ season: +e.target.value, selected: [], position: "" })
              }
            >
              {!coverage && <option value={season}>Unsupported season</option>}
              {catalog.seasons.map((s) => (
                <option key={s.season} value={s.season}>
                  {seasonLabel(s.season)}
                </option>
              ))}
            </select>
          </label>
          <label className="control">
            <span>PLAYER OR PROGRAM</span>
            <input
              type="search"
              value={query}
              placeholder="Name or program…"
              onChange={(e) => update({ query: e.target.value }, true)}
            />
          </label>
          <label className="control">
            <span>SOURCE POSITION</span>
            <select
              value={position}
              onChange={(e) => update({ position: e.target.value })}
            >
              <option value="">All positions</option>
              {position && !positions.includes(position) && (
                <option value={position}>
                  {position} · not in this sample
                </option>
              )}
              {positions.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="control">
            <span>MINUTES PER GAME</span>
            <select
              value={minimumMinutes}
              onChange={(e) => update({ minimumMinutes: +e.target.value })}
            >
              <option value={0}>Any qualified workload</option>
              <option value={20}>20+ minutes</option>
              <option value={30}>30+ minutes</option>
            </select>
          </label>
        </div>
        <p className="note">
          Qualified records: at least 15 games, 400 minutes and complete
          box-score fields. Rankings and percentiles use qualified
          player/program records in the selected source season, before search,
          position and workload filters. Team labels describe that season.
          Changing seasons clears the shortlist.
        </p>
        {!coverage ? (
          <p className="empty">Choose a supported stat season.</p>
        ) : error ? (
          <div role="alert" className="status-error">
            {error}{" "}
            <button
              className="button secondary"
              onClick={() => {
                cache.current.delete(season);
                setRetry(retry + 1);
              }}
            >
              Retry player statistics
            </button>
          </div>
        ) : !ready ? (
          <p className="empty" role="status">
            Loading season statistics…
          </p>
        ) : (
          <>
            <div className="board-sample">
              <div>
                <strong>{filtered.length.toLocaleString()}</strong>
                <span>Matching player/program records</span>
              </div>
              <div>
                <strong>{board.peers.toLocaleString()}</strong>
                <span>Qualified season reference records</span>
              </div>
              <div>
                <strong>
                  {coverage.appearance_games.toLocaleString()} /{" "}
                  {coverage.completed_schedule_games.toLocaleString()}
                </strong>
                <span>Games with appearances / completed schedule</span>
              </div>
            </div>
            {coverage.appearance_games <
              coverage.completed_schedule_games * 0.8 && (
              <p className="career-coverage-warning">
                Sparse source coverage. These are partial samples; missing games
                can materially change the rankings.
              </p>
            )}
            {board.peers < 30 && (
              <p role="status" className="career-coverage-warning">
                Fewer than 30 qualified records. Raw production remains
                available; priority scores and percentiles are withheld.
              </p>
            )}
            {!board.sum && (
              <p role="status" className="career-coverage-warning">
                All weights are zero. Choose a priority or add a positive weight
                to rank players.
              </p>
            )}
            <div className="section-heading">
              <p className="note">
                Priority score / 0–100 weighted percentile. Higher matches your
                selected production priorities.
              </p>
              <button
                className="button secondary"
                disabled={!filtered.length}
                onClick={download}
              >
                Download filtered CSV
              </button>
            </div>
            <div className="table-scroll">
              <table className="data-table board-results">
                <thead>
                  <tr>
                    <th>Season rank</th>
                    <th>Player / stat-season program</th>
                    <th>Priority score</th>
                    <th>GP · MIN/G</th>
                    <th>PTS / 40</th>
                    <th>AST / 40</th>
                    <th>REB / 40</th>
                    <th>TS%</th>
                    <th>Evidence / shortlist</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(page * 25, page * 25 + 25).map((r) => {
                    const p = r.player,
                      key = selectionKey(p),
                      picked = selected.includes(key);
                    return (
                      <tr key={key}>
                        <td className="rank-number">{r.rank ?? "—"}</td>
                        <th scope="row">
                          <Link
                            href={`/basketball/player/?id=${p.id}&season=${season}`}
                          >
                            {p.name}
                          </Link>
                          <small>
                            {p.team} · {p.position || "Position unavailable"}
                          </small>
                        </th>
                        <td>
                          <strong className="board-score">
                            {fmt(r.score, 1)}
                          </strong>
                        </td>
                        <td>
                          {p.games}
                          <small>{fmt(p.mpg)} MIN/G</small>
                        </td>
                        <td>{fmt(r.values.ppg)}</td>
                        <td>{fmt(r.values.apg)}</td>
                        <td>{fmt(r.values.rpg)}</td>
                        <td>
                          {r.values.ts === null ? "—" : fmt(100 * r.values.ts)}
                        </td>
                        <td>
                          <button
                            className="board-pick"
                            aria-pressed={picked}
                            disabled={!picked && selected.length >= 3}
                            onClick={() =>
                              update({
                                selected: picked
                                  ? selected.filter((s) => s !== key)
                                  : [...selected, key],
                              })
                            }
                          >
                            {picked ? "Remove" : "Shortlist"} {p.name}
                          </button>
                          <details className="board-evidence">
                            <summary>Explain this rank</summary>
                            <p>
                              Each contribution is its favorable percentile ×
                              normalized weight. Fewer turnovers receive a
                              higher favorable percentile. Displayed terms are
                              rounded; exports retain full precision.
                            </p>
                            <table>
                              <thead>
                                <tr>
                                  <th>Metric</th>
                                  <th>Value</th>
                                  <th>Favorable percentile</th>
                                  <th>Weight</th>
                                  <th>Score points</th>
                                </tr>
                              </thead>
                              <tbody>
                                {boardMetrics.map((m) => (
                                  <tr key={m.key}>
                                    <th>
                                      {m.unit}
                                      {m.key === "topg" ? " ↓" : ""}
                                    </th>
                                    <td>
                                      {fmt(
                                        r.values[m.key] === null
                                          ? null
                                          : r.values[m.key]! *
                                              (m.key === "ts" || m.key === "efg"
                                                ? 100
                                                : 1),
                                        2,
                                      )}
                                    </td>
                                    <td>
                                      <span
                                        className="board-percentile"
                                        style={
                                          {
                                            "--pct": `${r.percentiles[m.key] ?? 0}%`,
                                          } as React.CSSProperties
                                        }
                                      >
                                        {fmt(r.percentiles[m.key], 1)}
                                      </span>
                                      <small>
                                        {board.peerCounts[
                                          m.key
                                        ].toLocaleString()}{" "}
                                        peers
                                      </small>
                                    </td>
                                    <td>
                                      {fmt(
                                        board.sum
                                          ? (weights[m.key] * 100) / board.sum
                                          : 0,
                                        1,
                                      )}
                                      %
                                    </td>
                                    <td>{fmt(r.contributions[m.key], 3)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p>
                              Historical production, not current availability or
                              an opponent-adjusted player forecast.
                            </p>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!filtered.length && (
              <p className="empty">No qualified players match these filters.</p>
            )}
            <div className="pagination">
              <span>
                {filtered.length.toLocaleString()} matches · page {page + 1} of{" "}
                {Math.max(1, Math.ceil(filtered.length / 25))}
              </span>
              <div>
                <button
                  className="button secondary"
                  disabled={!page}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  className="button secondary"
                  disabled={(page + 1) * 25 >= filtered.length}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
            <button
              className="hero-link"
              onClick={() =>
                update({ query: "", position: "", minimumMinutes: 0 })
              }
            >
              Clear result filters
            </button>
          </>
        )}
      </section>
      <section
        className="board-shortlist section"
        aria-label="Player shortlist"
      >
        <div>
          <div className="eyebrow">03 / Take a closer look</div>
          <h2>Your shortlist.</h2>
          <p>
            Choose up to three player/program records. Compare their detailed
            totals, shooting attempts and game evidence.
          </p>
        </div>
        <div>
          {picks.map((r) => (
            <div className="board-selection" key={selectionKey(r.player)}>
              <span>
                <strong>{r.player.name}</strong>
                <small>
                  {r.player.team} · {seasonLabel(season)}
                </small>
              </span>
              <button
                aria-label={`Remove ${r.player.name} from shortlist`}
                onClick={() =>
                  update({
                    selected: selected.filter(
                      (s) => s !== selectionKey(r.player),
                    ),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          {!selected.length && (
            <p className="note">Use “Shortlist” beside a player to begin.</p>
          )}
          {missingPicks > 0 && (
            <p role="alert">
              {missingPicks} shortlisted records are absent from this qualified
              season sample. Clear the shortlist to choose again.
            </p>
          )}
          {selected.length > 0 && (
            <button
              className="hero-link"
              onClick={() => update({ selected: [] })}
            >
              Clear shortlist
            </button>
          )}
          {picks.length > 0 && (
            <Link
              className="button"
              href={`/basketball/compare-players/?${comparisonParams(
                picks.map((r) => r.player),
                "per40",
              )}`}
            >
              Compare {picks.length} selected{" "}
              {picks.length === 1 ? "player" : "players"} →
            </Link>
          )}
        </div>
      </section>
      <section className="section paper-panel">
        <div className="eyebrow">Method / Keep the context</div>
        <h2>A transparent starting point.</h2>
        <p>
          Each counting statistic is scaled to 40 recorded minutes. Shooting
          rates use pooled season totals. True shooting estimates points per
          shooting opportunity using PTS / [2 × (FGA + 0.475 FTA)]. This
          coefficient is an approximation. Per-40 rates adjust playing time, but
          do not adjust pace, opponents, role or teammates.
        </p>
        <p>
          For each metric, favorable percentile is the proportion of qualified
          season records below the value plus half of ties. Rates are compared
          at ten decimal places to avoid splitting ties through floating-point
          arithmetic. Turnovers reverse the direction. Each metric needs at
          least 30 valid peer values. Missing active metrics withhold the score;
          inactive metrics contribute zero. Ranks share scores tied at ten
          decimal places. Position labels and filters never redefine the
          reference group.
        </p>
        <p>
          Weights express your priorities. Correlated statistics can count
          similar production twice. Steals and blocks omit positioning, contests
          and other defensive work; fewer turnovers can reflect limited
          ball-handling responsibility. A high score establishes neither overall
          ability, future performance, roster eligibility nor transfer
          availability. Some archived opponents are outside Division I. Separate
          program stints remain separate records, and source IDs are not
          verified person-level crosswalks.
        </p>
        <div className="hero-actions">
          <Link className="hero-link" href="/basketball/impact/">
            Study opponent-context RAPM →
          </Link>
          <Link className="hero-link" href="/basketball/recruiting/">
            Read dated recruiting evidence →
          </Link>
          <Link className="hero-link" href="/basketball/players/">
            Browse single-stat rankings →
          </Link>
        </div>
        <details className="board-source">
          <summary>Source coverage and edition</summary>
          <p>
            SportsDataverse bulk releases; publisher-stated CC BY 4.0.
            Silvermine normalizes box scores, aggregates program-season
            production and calculates these scouting priorities.
          </p>
          {ready && (
            <>
              <p className="source-hash">Edition {ready.edition}</p>
              <a
                className="hero-link"
                href={`/data/basketball/history/players-${season}.json`}
              >
                Download the full season index ↗
              </a>
            </>
          )}
          <p>
            Archive generated {catalog.generated_at}. The coverage counts
            describe retained source releases, not verified national
            completeness.
          </p>
          {catalog.sources
            .flat()
            .filter((s) => s.season === season)
            .map((s) => (
              <p key={s.dataset}>
                <a href={s.url}>
                  {s.dataset} / {s.season} ↗
                </a>
                <br />
                <small>Retrieved {s.fetched_at}</small>
                <br />
                <small className="source-hash">SHA-256 {s.sha256}</small>
              </p>
            ))}
        </details>
      </section>
    </>
  );
}
