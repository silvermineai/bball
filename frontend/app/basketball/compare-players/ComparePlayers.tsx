"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fmt } from "../../_lib/format";
import {
  seasonLabel,
  type CareerCatalog,
  type CareerData,
  type CareerSummary,
  type StatKey,
} from "../../_lib/careers";
import {
  comparisonCsv,
  comparisonParams,
  counting,
  countValue,
  joinComparison,
  peerMetrics,
  peerValue,
  percentile,
  rateValue,
  readSelections,
  selectionKey,
  shooting,
  validateSeason,
  type Basis,
  type Comparison,
  type RateMetric,
  type Selection,
  type SeasonPlayers,
} from "../../_lib/player-comparison";

async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw Error(
      response.status === 404
        ? "This historical record is unavailable. Choose another record or retry."
        : "The archive could not be loaded. Please retry.",
    );
  return response.json();
}
const letter = (index: number) => String.fromCharCode(65 + index);
const percent = (v: number | null | undefined) =>
  v == null ? "—" : `${fmt(v * 100)}%`;
function rateSample(s: CareerSummary, metric: RateMetric) {
  const t = s.totals;
  const fields: Record<Exclude<RateMetric, "two_pct">, StatKey[]> = {
    efg: ["fgm", "tpm", "fga"],
    ts: ["pts", "fga", "fta"],
    fg_pct: ["fgm", "fga"],
    three_pct: ["tpm", "tpa"],
    ft_pct: ["ftm", "fta"],
    three_rate: ["tpa", "fga"],
    ft_rate: ["fta", "fga"],
    ast_to: ["ast", "tov"],
  };
  if (metric === "two_pct") {
    const made = t.fgm === null || t.tpm === null ? null : t.fgm - t.tpm;
    const attempted = t.fga === null || t.tpa === null ? null : t.fga - t.tpa;
    return `${fmt(made, 0)} 2PM · ${fmt(attempted, 0)} 2PA`;
  }
  return fields[metric]
    .map(
      (key) =>
        `${fmt(t[key], 0)} ${key === "tpm" ? "3PM" : key === "tpa" ? "3PA" : key.toUpperCase()}`,
    )
    .join(" · ");
}
export default function ComparePlayers({
  catalog,
}: {
  catalog: CareerCatalog;
}) {
  const params = useSearchParams();
  const urlState = params.toString();
  const parsed = useMemo(
    () =>
      readSelections(
        new URLSearchParams(urlState),
        catalog.seasons.map((s) => s.season),
      ),
    [urlState, catalog],
  );
  const selections = parsed.selections;
  const basis: Basis = params.get("basis") === "perGame" ? "perGame" : "per40";
  const keys = selections.map(selectionKey).join(",");
  const [season, setSeason] = useState(2026),
    [query, setQuery] = useState("");
  const [index, setIndex] = useState<SeasonPlayers | null>(null),
    [searchError, setSearchError] = useState("");
  const [retry, setRetry] = useState(0),
    [searchRetry, setSearchRetry] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, Comparison>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setIndex(null);
    setSearchError("");
    read<SeasonPlayers>(
      `/data/basketball/history/players-${season}.json`,
      c.signal,
    )
      .then((value) => {
        validateSeason(value, season, catalog);
        if (!c.signal.aborted) setIndex(value);
      })
      .catch((e) => {
        if (!c.signal.aborted) setSearchError(e.message);
      });
    return () => c.abort();
  }, [season, catalog, searchRetry]);
  useEffect(() => {
    const c = new AbortController();
    setLoaded({});
    setErrors({});
    setStatus("");
    const choices = readSelections(
      new URLSearchParams(keys.split(",").map((k) => ["p", k])),
      catalog.seasons.map((s) => s.season),
    ).selections;
    const seasons = new Map<number, Promise<SeasonPlayers>>();
    for (const s of choices) {
      if (!seasons.has(s.season))
        seasons.set(
          s.season,
          read<SeasonPlayers>(
            `/data/basketball/history/players-${s.season}.json`,
            c.signal,
          ).then((v) => validateSeason(v, s.season, catalog)),
        );
      Promise.all([
        seasons.get(s.season)!,
        read<CareerData>(
          `/api/basketball/research/careers/${s.id}?season=${s.season}`,
          c.signal,
        ),
      ])
        .then(([index, data]) => {
          const record = joinComparison(s, index, data);
          if (!c.signal.aborted)
            setLoaded((all) => ({ ...all, [selectionKey(s)]: record }));
        })
        .catch((e) => {
          if (!c.signal.aborted)
            setErrors((all) => ({ ...all, [selectionKey(s)]: e.message }));
        });
    }
    return () => c.abort();
  }, [keys, catalog, retry]);
  const update = (next: Selection[], nextBasis = basis) => {
    const url = new URL(window.location.href);
    url.search = comparisonParams(next, nextBasis);
    window.history.pushState(null, "", url);
  };
  const searchPlayers = index?.season === season ? index.players : [];
  const matching = searchPlayers
    .filter((p) =>
      (p.name + " " + p.team)
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .sort(
      (a, b) => a.name.localeCompare(b.name) || a.team.localeCompare(b.team),
    );
  const records = selections
    .map((s) => loaded[selectionKey(s)])
    .filter((r): r is Comparison => !!r);
  const ready = selections.length > 0 && records.length === selections.length;
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("Comparison link copied.");
    } catch {
      setStatus("Copy the address from your browser to share this comparison.");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([comparisonCsv(records, basis)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "basketball-player-comparison.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <div className="page-title pc-title">
        <div className="eyebrow">
          Personnel workbench / {catalog.seasons.length} source seasons
        </div>
        <h1>
          Compare the player.
          <br />
          Understand the role.
        </h1>
        <p>
          Put up to three player/program seasons alongside one another. Separate
          playing time from production, inspect the shooting sample and compare
          each record with its season’s qualified peers.
        </p>
        <div className="hero-actions">
          <Link className="hero-link" href="/basketball/recruiting/">
            School announcement evidence →
          </Link>
          <Link className="hero-link" href="/basketball/players/">
            Full player archive →
          </Link>
        </div>
      </div>
      {parsed.rejected > 0 && (
        <p role="alert" className="career-coverage-warning">
          {parsed.rejected} unsupported or excess selections were ignored. This
          desk supports three distinct player/program seasons from the archive.
        </p>
      )}
      <section className="pc-picker section" aria-labelledby="pc-pick-title">
        <div className="section-heading">
          <div>
            <div className="eyebrow">01 / Build your comparison</div>
            <h2 id="pc-pick-title">Who belongs in the conversation?</h2>
          </div>
          <span className="pc-selection-count">
            {selections.length} / 3 records
          </span>
        </div>
        <div className="toolbar">
          <label className="control">
            <span>SEARCH SEASON</span>
            <select value={season} onChange={(e) => setSeason(+e.target.value)}>
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
              placeholder="Milan Momcilovic, Tennessee…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {searchError ? (
          <div role="alert" className="empty">
            {searchError}{" "}
            <button
              className="button secondary"
              onClick={() => setSearchRetry(searchRetry + 1)}
            >
              Retry search
            </button>
          </div>
        ) : !index || index.season !== season ? (
          <p role="status" className="note">
            Loading this season’s player index…
          </p>
        ) : (
          <>
            <p className="note">
              {index.coverage.appearance_games.toLocaleString()} games with
              player appearances /{" "}
              {index.coverage.completed_schedule_games.toLocaleString()}{" "}
              completed schedule entries.{" "}
              {index.coverage.appearance_games <
                index.coverage.completed_schedule_games * 0.8 && (
                <strong>
                  Sparse source coverage; these records can be very partial.
                </strong>
              )}
            </p>
            {query.trim() ? (
              <>
                <div
                  className="pc-search-results"
                  aria-label="Player search results"
                >
                  {matching.slice(0, 12).map((p) => {
                    const s = {
                      season: p.season,
                      id: p.id,
                      team_id: p.team_id,
                    };
                    const selected = selections.some(
                      (v) => selectionKey(v) === selectionKey(s),
                    );
                    return (
                      <button
                        className="pc-search-result"
                        key={selectionKey(s)}
                        disabled={selected || selections.length === 3}
                        onClick={() => update([...selections, s])}
                        aria-label={`Add ${p.name}, ${p.team}, ${seasonLabel(p.season)}`}
                      >
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.team} · {p.position || "Position unreported"}
                          </small>
                        </span>
                        <span>
                          {p.games} GP · {fmt(p.mpg)} MIN/G
                          <small>
                            {selected
                              ? "Added ✓"
                              : selections.length === 3
                                ? "Remove a record to add"
                                : "+ Add to comparison"}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="note">
                  {matching.length
                    ? `${matching.length.toLocaleString()} matching records${matching.length > 12 ? " · showing the first 12; refine your search" : ""}.`
                    : "No matching player/program records in this season."}
                </p>
              </>
            ) : (
              <p className="note">
                Search a name or program to add a record. You can select the
                same source identity in different seasons; program labels
                describe historical appearances.
              </p>
            )}
          </>
        )}
      </section>
      <div className="pc-cards" aria-label="Selected players">
        {[0, 1, 2].map((i) => {
          const s = selections[i],
            r = s ? loaded[selectionKey(s)] : undefined;
          return (
            <article
              className={`pc-card pc-slot-${i}`}
              key={s ? selectionKey(s) : `empty-${i}`}
            >
              <div className="pc-card-top">
                <span className="pc-letter">{letter(i)}</span>
                {s && (
                  <button
                    className="pc-remove"
                    aria-label={`Remove ${r?.player.name || selectionKey(s)}`}
                    onClick={() => update(selections.filter((_, n) => n !== i))}
                  >
                    Remove ×
                  </button>
                )}
              </div>
              {!s ? (
                <>
                  <h2>
                    {i === 0
                      ? "Start with a player."
                      : "Add another perspective."}
                  </h2>
                  <p>
                    Search the archive above, or open a comparison from a player
                    file or reviewed recruiting record.
                  </p>
                </>
              ) : !r ? (
                <>
                  <h2>{seasonLabel(s.season)}</h2>
                  <p>
                    Source {s.id} · program {s.team_id}
                  </p>
                  {errors[selectionKey(s)] ? (
                    <p role="alert">{errors[selectionKey(s)]}</p>
                  ) : (
                    <p role="status">Loading the recorded production…</p>
                  )}
                </>
              ) : (
                <>
                  <div className="eyebrow">
                    {seasonLabel(s.season)} ·{" "}
                    {r.player.position || "Position unreported"}
                  </div>
                  <h2>{r.player.name}</h2>
                  <p className="pc-program">{r.player.team}</p>
                  <div className="pc-card-numbers">
                    <div>
                      <strong>{r.summary.games}</strong>
                      <span>Games</span>
                    </div>
                    <div>
                      <strong>{fmt(r.summary.totals.min, 0)}</strong>
                      <span>Minutes</span>
                    </div>
                    <div>
                      <strong>{fmt(r.summary.mpg)}</strong>
                      <span>MIN / G</span>
                    </div>
                  </div>
                  <p className="pc-sample">
                    {r.summary.qualified
                      ? "Qualified historical sample"
                      : "Below peer qualification · percentiles withheld"}
                    {r.summary.incomplete_box_games > 0 &&
                      ` · ${r.summary.incomplete_box_games} incomplete box games`}
                  </p>
                  <Link
                    className="hero-link"
                    href={`/basketball/player/?id=${s.id}&season=${s.season}`}
                  >
                    Inspect the game evidence →
                  </Link>
                </>
              )}
            </article>
          );
        })}
      </div>
      <div className="pc-actions">
        <div>
          <button
            className="button secondary"
            disabled={!selections.length}
            onClick={share}
          >
            Copy comparison link
          </button>
          <button
            className="button secondary"
            disabled={!ready}
            onClick={download}
          >
            Download comparison CSV
          </button>
          {selections.length > 0 && (
            <button className="button secondary" onClick={() => update([])}>
              Clear comparison
            </button>
          )}
          {Object.keys(errors).some((key) =>
            selections.some((s) => selectionKey(s) === key),
          ) && (
            <button className="button" onClick={() => setRetry(retry + 1)}>
              Retry selected records
            </button>
          )}
        </div>
        <p role="status" className="note">
          {status}
        </p>
      </div>
      {ready && (
        <>
          <section className="section" aria-labelledby="pc-role-title">
            <div className="section-heading">
              <div>
                <div className="eyebrow">02 / Season-relative production</div>
                <h2 id="pc-role-title">Where the production stands out.</h2>
              </div>
              <span className="note">
                Lower value ← percentile → Higher value
              </span>
            </div>
            <p className="note">
              Each dot compares one record with qualified player/program records
              in its own season, across all reported positions. Counting
              measures always use per 40 minutes here. Higher means more of that
              statistic; turnover volume is not a positive grade. These are
              descriptive percentiles, not talent rankings or opponent-adjusted
              impact.
            </p>
            <div className="pc-percentiles">
              {peerMetrics.map((metric) => (
                <div className="pc-percentile-row" key={metric.key}>
                  <div className="pc-metric-label">
                    <strong>{metric.label}</strong>
                    <small>{metric.unit}</small>
                  </div>
                  {records.map((r, i) => {
                    const p = percentile(r.player, r.peers, metric.key),
                      v = peerValue(r.player, metric.key);
                    return (
                      <div
                        className={`pc-percentile pc-slot-${i}`}
                        key={selectionKey(r.selection)}
                      >
                        <div className="pc-percentile-heading">
                          <span>
                            {letter(i)} ·{" "}
                            {metric.key === "ts" || metric.key === "efg"
                              ? percent(v)
                              : fmt(v)}
                          </span>
                          <strong>
                            {p.value === null
                              ? "Unranked"
                              : `Pct. ${fmt(p.value, 0)}`}
                          </strong>
                        </div>
                        <div
                          className="pc-rail"
                          role="img"
                          aria-label={`${r.player.name}, ${seasonLabel(r.selection.season)}, ${metric.label}: ${p.value === null ? "percentile unavailable" : `${fmt(p.value, 1)} percentile among ${p.n} qualified records`}`}
                        >
                          {p.value !== null && (
                            <span style={{ left: `${p.value}%` }} />
                          )}
                        </div>
                        <small>
                          {p.n.toLocaleString()} eligible peers ·{" "}
                          {seasonLabel(r.selection.season)}
                        </small>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
          <section className="section" aria-labelledby="pc-stats-title">
            <div className="section-heading">
              <div>
                <div className="eyebrow">03 / The numbers side by side</div>
                <h2 id="pc-stats-title">Same lens. Different workloads.</h2>
              </div>
              <label className="control">
                <span>COUNTING STAT BASIS</span>
                <select
                  value={basis}
                  onChange={(e) => update(selections, e.target.value as Basis)}
                >
                  <option value="per40">Per 40 minutes</option>
                  <option value="perGame">Per recorded game</option>
                </select>
              </label>
            </div>
            <p className="note">
              Per 40 minutes scales recorded production by playing time. It does
              not adjust for pace, opponents or role, and does not predict a
              full-game workload. Shooting rates use pooled attempts; a small
              denominator can make a percentage misleading.
            </p>
            <div className="table-scroll">
              <table className="data-table pc-stat-table">
                <caption>
                  Historical program-specific production ·{" "}
                  {basis === "per40" ? "per 40 minutes" : "per recorded game"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Measure</th>
                    {records.map((r, i) => (
                      <th scope="col" key={selectionKey(r.selection)}>
                        {letter(i)} · {r.player.name}
                        <small>
                          {r.player.team} · {seasonLabel(r.selection.season)}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {counting.map(([field, label]) => (
                    <tr key={field} data-metric={field}>
                      <th scope="row">
                        {label}
                        <small>
                          {basis === "per40" ? "Per 40 minutes" : "Per game"}
                        </small>
                      </th>
                      {records.map((r) => (
                        <td key={selectionKey(r.selection)}>
                          <strong>
                            {fmt(countValue(r.summary, field, basis))}
                          </strong>
                          <small>
                            {fmt(r.summary.totals[field], 0)} total ·{" "}
                            {r.summary.samples[field]} / {r.summary.games}{" "}
                            recorded games
                          </small>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {shooting.map((m) => (
                    <tr key={m.key} data-metric={m.key}>
                      <th scope="row">
                        {m.label}
                        <small>{m.formula}</small>
                      </th>
                      {records.map((r) => (
                        <td key={selectionKey(r.selection)}>
                          <strong>
                            {m.percent
                              ? percent(rateValue(r.summary, m.key))
                              : fmt(rateValue(r.summary, m.key), 2)}
                          </strong>
                          <small>{rateSample(r.summary, m.key)}</small>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {(
                    [
                      ["fgm", "fga", "FG made / attempted"],
                      ["tpm", "tpa", "3P made / attempted"],
                      ["ftm", "fta", "FT made / attempted"],
                    ] as const
                  ).map(([made, attempted, label]) => (
                    <tr key={made} data-metric={made}>
                      <th scope="row">{label}</th>
                      {records.map((r) => (
                        <td key={selectionKey(r.selection)}>
                          <strong>
                            {fmt(r.summary.totals[made], 0)} /{" "}
                            {fmt(r.summary.totals[attempted], 0)}
                          </strong>
                          <small>
                            {r.summary.samples[made]} made-field games ·{" "}
                            {r.summary.samples[attempted]} attempt-field games
                          </small>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="section paper-panel">
            <div className="eyebrow">04 / Read the sample</div>
            <h2>Evidence before an evaluation.</h2>
            <p>
              A comparison uses one source identity, one program and one season
              per column. It never combines a same-name player or a different
              program’s totals. Different seasons can have different
              competition, role and source coverage. Historical program labels
              do not establish recruiting availability, eligibility or current
              team membership.
            </p>
            <p>
              Only positive-minute appearances matched to completed games enter
              the archive’s summaries. If a field is missing in any included
              game, its total and affected rates remain unavailable; unrelated
              complete statistics still appear. Zero attempts produce no
              shooting percentage. Per-game denominators count recorded playing
              appearances, not every scheduled game.
            </p>
            <p>
              Percentiles require at least 15 games, 400 minutes and complete
              box fields for the selected record, plus at least 30 qualified
              records with that metric in its season. A percentile is the share
              of qualified records below the value, plus half the share tied,
              with a small floating-point tolerance. No position or conference
              filter is applied. The source includes some opponents outside
              Division I. No percentiles are assigned to three-point accuracy
              because this index has no peer attempt minimum.
            </p>
            <div className="pc-evidence">
              {records.map((r, i) => (
                <details key={selectionKey(r.selection)}>
                  <summary>
                    {letter(i)} · {r.player.name} ·{" "}
                    {seasonLabel(r.selection.season)} · Source & field coverage
                  </summary>
                  <p>
                    {r.coverage.appearance_games.toLocaleString()} games with
                    player appearances /{" "}
                    {r.coverage.completed_schedule_games.toLocaleString()}{" "}
                    completed schedule entries in the season source.{" "}
                    {r.coverage.appearance_games <
                      r.coverage.completed_schedule_games * 0.8 && (
                      <strong>
                        Sparse archive coverage; this is a partial historical
                        sample.
                      </strong>
                    )}
                  </p>
                  <p>
                    {r.summary.source_records} program source rows ·{" "}
                    {r.summary.dnp_records} reported DNP ·{" "}
                    {r.summary.excluded_records} excluded from playing averages.
                  </p>
                  <dl className="raw-stat-grid">
                    {Object.entries(r.summary.samples).map(([field, n]) => (
                      <div key={field}>
                        <dt>{field.toUpperCase()}</dt>
                        <dd>
                          {n} / {r.summary.games} games · total{" "}
                          {fmt(r.summary.totals[field as StatKey], 0)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="source-hash">Archive edition {r.edition}</p>
                  {r.sources.map((s) => (
                    <p key={`${s.dataset}-${s.sha256}`}>
                      <a className="hero-link" href={s.url}>
                        {s.dataset} · {s.season} ↗
                      </a>
                      <br />
                      <small>Retrieved {s.fetched_at}</small>
                      <br />
                      <small className="source-hash">SHA-256 {s.sha256}</small>
                    </p>
                  ))}
                </details>
              ))}
            </div>
            <p>
              Source: SportsDataverse bulk releases, labeled CC BY 4.0 by the
              publisher. Silvermine normalizes the observations and calculates
              the summaries. Current forecasts and prospective model records do
              not use these comparison selections.
            </p>
          </section>
        </>
      )}
    </>
  );
}
