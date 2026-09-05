"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { date } from "../../_lib/format";
import {
  eventCsv,
  formatEventMetric,
  type EventIndex,
  type EventRecord,
  type EventResponse,
} from "../../_lib/football-events";

export default function EventBrowser({ index }: { index: EventIndex }) {
  const params = useSearchParams();
  const inspectButton = useRef<HTMLButtonElement | null>(null);
  const scrollRequested = useRef(false);
  const [dataset, setDataset] = useState(
    params.get("dataset") === "specialists" ? "specialists" : "defense",
  );
  const [season, setSeason] = useState(params.get("season") || "2025");
  const [team, setTeam] = useState(params.get("team") || "");
  const [game, setGame] = useState(params.get("game") || "");
  const [query, setQuery] = useState(params.get("q") || "");
  const [division, setDivision] = useState(params.get("division") || "all");
  const [sort, setSort] = useState(params.get("sort") || "date");
  const [direction, setDirection] = useState(
    params.get("direction") === "asc" ? "asc" : "desc",
  );
  const [positive, setPositive] = useState(params.get("positive") === "1");
  const [page, setPage] = useState(0),
    [data, setData] = useState<EventResponse | null>(null),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<EventRecord | null>(null),
    [retry, setRetry] = useState(0);
  const edition = index.editions.find(
    (e) => e.dataset === dataset && e.season === +season,
  );
  const fields = edition?.fields || [];
  const validSort = sort === "date" || fields.some((f) => f.key === sort);
  const valid =
    !!edition &&
    validSort &&
    ["all", "fbs", "fcs"].includes(division) &&
    (!team || /^\d{1,15}$/.test(team)) &&
    (!game || /^\d{1,15}$/.test(game));
  useEffect(() => {
    setData(null);
    setError("");
    setSelected(null);
    if (!valid || !edition) {
      setError(
        "These link filters are unavailable. Reset filters to browse the published editions.",
      );
      return;
    }
    const controller = new AbortController();
    const q = new URLSearchParams({
      dataset,
      season,
      edition: edition.edition,
      sort,
      direction,
      division,
      page: String(page),
    });
    if (team) q.set("team", team);
    if (game) q.set("game", game);
    if (query.trim()) q.set("q", query.trim());
    if (positive && sort !== "date") q.set("positive", "1");
    const publicQuery = new URLSearchParams(q);
    publicQuery.delete("edition");
    publicQuery.delete("page");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${publicQuery}`,
    );
    const timer = window.setTimeout(() => {
      fetch(`/api/football/events?${q}`, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok)
            throw Error(
              r.status === 404
                ? "This source edition is unavailable. Reload the page for the latest index."
                : "The event records could not be loaded. Try again.",
            );
          const result: EventResponse = await r.json();
          if (result.edition !== edition.edition)
            throw Error(
              "The returned edition does not match this notebook. Reload to continue.",
            );
          return result;
        })
        .then((result) => {
          if (!controller.signal.aborted) setData(result);
        })
        .catch((e) => {
          if (!controller.signal.aborted && e.name !== "AbortError")
            setError(e.message);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    dataset,
    season,
    team,
    game,
    query,
    division,
    sort,
    direction,
    positive,
    page,
    retry,
    valid,
    edition,
  ]);
  useEffect(() => {
    if (data && scrollRequested.current) {
      scrollRequested.current = false;
      const target = document.getElementById("football-event-results");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "start" });
    }
  }, [data]);
  const reset = () => {
    setDataset("defense");
    setSeason("2025");
    setTeam("");
    setGame("");
    setQuery("");
    setDivision("all");
    setSort("date");
    setDirection("desc");
    setPositive(false);
    setPage(0);
    setRetry((n) => n + 1);
  };
  const download = () => {
    if (!data || !edition) return;
    const url = URL.createObjectURL(
      new Blob([eventCsv(data.rows, fields, edition.edition)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `football-${dataset}-${season}-page-${page + 1}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const columns =
    dataset === "defense"
      ? [
          "sacks",
          "interceptions",
          "pass_breakups",
          "forced_fumbles",
          "fumble_recoveries",
        ]
      : ["field_goals", "punts", "punts_yards", "kick_returns", "punt_returns"];
  const displayColumns =
    sort !== "date" && !columns.includes(sort)
      ? [sort, ...columns.slice(0, 4)]
      : columns;
  return (
    <>
      <div className="toolbar event-filters">
        <label className="control">
          <span>Record type</span>
          <select
            value={dataset}
            onChange={(e) => {
              setDataset(e.target.value);
              setSort("date");
              setPositive(false);
              setPage(0);
            }}
          >
            <option value="defense">Defense</option>
            <option value="specialists">Kicking, punting & returns</option>
          </select>
        </label>
        <label className="control">
          <span>Stat season</span>
          <select
            value={season}
            onChange={(e) => {
              setSeason(e.target.value);
              setTeam("");
              setGame("");
              setPage(0);
            }}
          >
            {Array.from(new Set(index.editions.map((e) => e.season))).map(
              (y) => (
                <option key={y} value={y}>
                  {y}
                  {y === 2026 ? " · Partial season" : ""}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="control">
          <span>Source player name</span>
          <input
            type="search"
            maxLength={100}
            placeholder="Search a name as recorded"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="control">
          <span>Team</span>
          <select
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All source teams</option>
            {team && !edition?.teams.some((t) => t.id === team) && (
              <option value={team}>
                Team {team} · no records in this edition
              </option>
            )}
            {edition?.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>Division</span>
          <select
            value={division}
            onChange={(e) => {
              setDivision(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All imported divisions</option>
            <option value="fbs">FBS</option>
            <option value="fcs">FCS</option>
          </select>
        </label>
        <label className="control">
          <span>Sort records by</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPositive(false);
              setPage(0);
            }}
          >
            <option value="date">Game date</option>
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>Order</span>
          <select
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              setPage(0);
            }}
          >
            <option value="desc">Highest / latest first</option>
            <option value="asc">Lowest / earliest first</option>
          </select>
        </label>
      </div>
      <div className="event-actions">
        {sort !== "date" && (
          <label>
            <input
              type="checkbox"
              checked={positive}
              onChange={(e) => {
                setPositive(e.target.checked);
                setPage(0);
              }}
            />{" "}
            Only positive values for this metric
          </label>
        )}
        {game && (
          <button
            className="button secondary"
            onClick={() => {
              setGame("");
              setPage(0);
            }}
          >
            Clear game {game} ×
          </button>
        )}
        <button className="button secondary" onClick={reset}>
          Reset filters
        </button>
        <button
          className="button secondary"
          onClick={download}
          disabled={!data?.rows.length}
        >
          Download this page · CSV
        </button>
      </div>
      {edition && (
        <div className="event-coverage">
          <div>
            <strong>{edition.coverage.records.toLocaleString("en-US")}</strong>
            <span>source records</span>
          </div>
          <div>
            <strong>{edition.coverage.games.toLocaleString("en-US")}</strong>
            <span>games represented</span>
          </div>
          <div>
            <strong>{edition.coverage.teams}</strong>
            <span>teams represented</span>
          </div>
          <p>
            Coverage of this {season}{" "}
            {dataset === "defense" ? "defensive" : "specialist"} release, before
            filters. Counts are records, not unique athletes. A dash is
            unavailable; zero is a supplied source value.
          </p>
        </div>
      )}
      {error ? (
        <div role="alert" className="status-error">
          <p>{error}</p>
          <button
            className="button secondary"
            onClick={() => setRetry((n) => n + 1)}
          >
            Try again
          </button>
        </div>
      ) : !data ? (
        <p className="empty" role="status">
          Loading event records…
        </p>
      ) : (
        <>
          <p className="note" role="status">
            {data.total.toLocaleString("en-US")} matching records. Sorting
            compares single-game source values; it is not a player ranking.
          </p>
          <div
            className="table-scroll"
            id="football-event-results"
            tabIndex={-1}
          >
            <table className="data-table event-table">
              <caption className="sr-only">
                Name-attributed {dataset} records. Select a source name to see
                all fields and provenance.
              </caption>
              <thead>
                <tr>
                  <th>Name / source team</th>
                  <th>Game</th>
                  {displayColumns.map((key) => (
                    <th className="numeric" key={key}>
                      {fields.find((f) => f.key === key)?.label || key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.record_key}>
                    <td>
                      <button
                        className="event-inspect"
                        aria-label={`Inspect ${r.player_name}, game ${r.game_id}`}
                        onClick={(event) => {
                          inspectButton.current = event.currentTarget;
                          setSelected(r);
                        }}
                      >
                        <strong>{r.player_name} ↗</strong>
                      </button>
                      <small>
                        {r.team} · {r.division.toUpperCase()}
                      </small>
                    </td>
                    <td>
                      {r.game ? (
                        <>
                          <span>{date(r.game.kickoff)}</span>
                          <small>
                            vs {r.game.opponent}
                            {r.game.neutral ? " · neutral" : ""}
                          </small>
                        </>
                      ) : (
                        <span>Game context unavailable</span>
                      )}
                    </td>
                    {displayColumns.map((key) => (
                      <td className="numeric" key={key}>
                        {formatEventMetric(r.metrics[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.rows.length && (
            <p className="empty">
              No source records match. Try a broader name, another season or all
              divisions. This does not establish zero production.
            </p>
          )}
          <div className="pagination">
            <span>
              Page {page + 1} of{" "}
              {Math.max(1, Math.ceil(data.total / data.page_size))}
            </span>
            <div>
              <button
                className="button secondary"
                disabled={!page}
                onClick={() => {
                  scrollRequested.current = true;
                  setPage((p) => p - 1);
                }}
              >
                ← Previous
              </button>
              <button
                className="button secondary"
                disabled={(page + 1) * data.page_size >= data.total}
                onClick={() => {
                  scrollRequested.current = true;
                  setPage((p) => p + 1);
                }}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
      {selected && edition && (
        <section
          className="section paper-panel event-detail"
          aria-label="Selected source record"
          tabIndex={-1}
          ref={(el) => {
            el?.focus({ preventScroll: true });
            el?.scrollIntoView({ block: "start" });
          }}
        >
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                Name-only identity / {selected.season} game evidence
              </div>
              <h2>{selected.player_name}</h2>
              <p>
                {selected.team}
                {selected.game
                  ? ` · vs ${selected.game.opponent} · ${date(selected.game.kickoff)}`
                  : " · unmatched game context"}
              </p>
            </div>
            <button
              className="button secondary"
              onClick={() => {
                setSelected(null);
                inspectButton.current?.focus({ preventScroll: true });
                inspectButton.current?.scrollIntoView({ block: "center" });
              }}
            >
              Close record
            </button>
          </div>
          {selected.game && (
            <p>
              {selected.game.completed &&
              selected.game.home_score !== null &&
              selected.game.away_score !== null
                ? `Final: ${selected.game.away_name} ${selected.game.away_score}, ${selected.game.home_name} ${selected.game.home_score}.`
                : "A complete final score is unavailable in this source edition."}
              {selected.game.neutral ? " Neutral site." : ""}
            </p>
          )}
          <p className="note">
            This source name is not linked to a verified athlete profile. Record{" "}
            {selected.record_key} in edition{" "}
            <span className="event-hash">{edition.edition}</span>. Context:{" "}
            {selected.context_status}.
          </p>
          <dl className="raw-stat-grid">
            {fields.map((f) => (
              <div key={f.key}>
                <dt>{f.label}</dt>
                <dd>
                  {formatEventMetric(selected.metrics[f.key])}
                  <small>{f.definition}</small>
                </dd>
              </div>
            ))}
          </dl>
          {selected.game_id && (
            <button
              className="button secondary"
              style={{ marginTop: 20 }}
              onClick={() => {
                scrollRequested.current = true;
                setGame(selected.game_id!);
                setQuery("");
                setTeam("");
                setDivision("all");
                setSort("date");
                setPositive(false);
                setSelected(null);
                setPage(0);
              }}
            >
              Show this game’s{" "}
              {dataset === "defense" ? "defensive" : "specialist"} records
            </button>
          )}
          <details style={{ marginTop: 20 }}>
            <summary>Every field in the original source row</summary>
            <dl className="raw-stat-grid">
              {Object.entries(selected.raw).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
      )}
      {edition && (
        <section className="section paper-panel">
          <h2>Definitions & field coverage.</h2>
          <p>
            Available counts describe the whole selected source edition.
            “Positive” counts rows whose source value is greater than zero;
            negative yardage remains available when reported.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Meaning</th>
                  <th>Available</th>
                  <th>Positive</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.key}>
                    <td>
                      {f.label}
                      <small>{f.key}</small>
                    </td>
                    <td style={{ whiteSpace: "normal", minWidth: 220 }}>
                      {f.definition}
                    </td>
                    <td>
                      {edition.coverage.fields[f.key].available.toLocaleString(
                        "en-US",
                      )}
                    </td>
                    <td>
                      {edition.coverage.fields[f.key].positive.toLocaleString(
                        "en-US",
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Definitions checked against{" "}
            <a href={edition.evidence.definitions_url}>
              cfbfastR’s published loader documentation ↗
            </a>
            . Field-goal attempts do not establish makes or accuracy; gross punt
            yards do not establish net punting.
          </p>
          <details>
            <summary>Edition, source downloads and receipts</summary>
            <p className="event-hash">{edition.edition}</p>
            <p>
              Normalized {date(edition.generated_at)}. Source retrieval clocks
              appear below.
            </p>
            {edition.evidence.sources.map((s) => (
              <div key={s.dataset} className="event-receipt">
                <a href={s.url}>{s.dataset} · source download ↗</a>
                <p>Retrieved {s.fetched_at}</p>
                <p className="event-hash">SHA-256 {s.sha256}</p>
              </div>
            ))}
            <p className="event-hash">
              Normalizer SHA-256 {edition.evidence.implementation_sha256}
            </p>
          </details>
        </section>
      )}
    </>
  );
}
