"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { date, fmt, kick, signed } from "../../_lib/format";
import { reasons, type Ledger } from "../../_lib/research-types";
export default function Scorecard() {
  const params = useSearchParams();
  const [sport, setSport] = useState<"football" | "basketball">(
    params.get("sport") === "basketball" ? "basketball" : "football",
  );
  const [data, setData] = useState<Ledger | null>(null),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    fetch("/data/research/ledger.json", { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw Error("The research ledger could not be loaded.");
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, []);
  if (error)
    return (
      <p role="alert" className="status-error">
        {error}
      </p>
    );
  if (!data)
    return (
      <p role="status" className="empty">
        Loading registered forecasts…
      </p>
    );
  const summary = data.sports[sport],
    m = summary.metrics;
  const rows = data.games.filter(
    (g) =>
      g.sport === sport &&
      (status === "all" || g.status === status) &&
      (g.home_name + " " + g.away_name)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="toolbar section" style={{ marginBottom: 20 }}>
        <label className="control">
          <span>SPORT</span>
          <select
            value={sport}
            onChange={(e) => {
              setSport(e.target.value as typeof sport);
              setPage(0);
              setStatus("all");
            }}
          >
            <option value="football">College football</option>
            <option value="basketball">Men’s college basketball</option>
          </select>
        </label>
        <p className="note">
          Prospective tracking started this edition. Historical backtests are
          reported separately.
        </p>
      </div>
      <div className="strip">
        <div>
          <strong>{summary.games.toLocaleString()}</strong>
          <span>Games with registered forecasts</span>
        </div>
        <div>
          <strong>{m.games.toLocaleString()}</strong>
          <span>Eligible games settled</span>
        </div>
        <div>
          <strong>{fmt(m.margin_mae)}</strong>
          <span>Margin MAE · points</span>
        </div>
        <div>
          <strong>
            {m.winner_accuracy === null
              ? "—"
              : fmt(m.winner_accuracy * 100) + "%"}
          </strong>
          <span>Winner accuracy · {m.winner_picks} picks</span>
        </div>
      </div>
      <div className="ledger-metrics">
        <span>
          Brier score <b>{fmt(m.brier, 4)}</b>
        </span>
        <span>
          Total MAE <b>{fmt(m.total_mae)}</b>
        </span>
        <span>
          Log loss <b>{fmt(m.log_loss, 4)}</b>
        </span>
        <span>
          80% interval coverage{" "}
          <b>
            {m.interval_coverage === null
              ? "—"
              : fmt(m.interval_coverage * 100) + "%"}
          </b>
        </span>
      </div>
      {!m.games && (
        <p className="empty">
          No eligible registered games have a verified final in this data
          edition. Accuracy and errors will appear after results are imported;
          no historical test is being presented as prospective performance.
        </p>
      )}
      <div className="section-heading section">
        <div>
          <div className="eyebrow">01 / Model against market</div>
          <h2>Compare on the same court.</h2>
        </div>
        <span className="note">
          {summary.games_with_comparisons} games with qualifying quotes
        </span>
      </div>
      {!summary.market_metrics.length ? (
        <div className="paper-panel">
          <h3>
            {summary.games_with_comparisons
              ? "Comparisons are waiting for results."
              : "The market record is still empty."}
          </h3>
          <p>
            {data.market_observations
              ? "No settled games have qualifying quotes for this sport yet."
              : "No timestamped odds-feed observations have been collected. Historical lines without a reliable pregame clock are excluded."}{" "}
            Model-versus-market errors will appear here once matched games
            settle.
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Provider / bookmaker</th>
                <th>Market</th>
                <th>Matched games</th>
                <th>Model MAE</th>
                <th>Market MAE</th>
                <th>Model Brier</th>
                <th>Market Brier</th>
              </tr>
            </thead>
            <tbody>
              {summary.market_metrics.map((r) => (
                <tr key={r.provider + r.bookmaker + r.market}>
                  <td>
                    {r.bookmaker}
                    <small>{r.provider}</small>
                  </td>
                  <td>{r.market}</td>
                  <td>{r.games}</td>
                  <td>{fmt(r.model_mae)}</td>
                  <td>{fmt(r.market_mae)}</td>
                  <td>{fmt(r.model_brier, 4)}</td>
                  <td>{fmt(r.market_brier, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">02 / The game ledger</div>
            <h2>Every forecast has a trail.</h2>
          </div>
          <span className="note">
            {summary.registered_versions.toLocaleString()} retained versions
          </span>
        </div>
        <div className="toolbar">
          <label className="control">
            <span>PROGRAM</span>
            <input
              type="search"
              placeholder="Search the ledger"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label className="control">
            <span>STATUS</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">All registered games</option>
              {[
                "scheduled",
                "awaiting_result",
                "settled",
                "excluded",
                "final_missing_scores",
                "inconsistent_final",
              ].map((s) => (
                <option value={s} key={s}>
                  {reasons[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Matchup / scheduled start</th>
                <th>Status</th>
                <th className="numeric">Home margin</th>
                <th className="numeric">Total</th>
                <th className="numeric">Home win</th>
                <th className="numeric">Actual margin</th>
                <th>Market observations</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(page * 25, page * 25 + 25).map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link
                      href={`/research/game/?sport=${sport}&id=${g.game_id}&selected=${g.id}`}
                    >
                      {g.away_name} at {g.home_name}
                    </Link>
                    <small>
                      {g.time_tbd
                        ? date(g.starts_at) + " · time TBD"
                        : kick(g.starts_at)}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`ledger-status ${g.status === "settled" ? "settled" : ""}`}
                    >
                      {reasons[g.status] || g.status}
                    </span>
                    {g.exclusion && <small>{reasons[g.exclusion]}</small>}
                  </td>
                  <td className="numeric">{signed(g.home_margin)}</td>
                  <td className="numeric">{fmt(g.total)}</td>
                  <td className="numeric">
                    {fmt(g.home_win_probability * 100)}%
                  </td>
                  <td className="numeric">
                    {g.actual_margin === null ? "—" : signed(g.actual_margin)}
                  </td>
                  <td>
                    {g.comparisons.length ? (
                      <details>
                        <summary>
                          {g.comparisons.length} last-observed quotes
                        </summary>
                        {g.comparisons.map((c) => (
                          <p
                            className="note"
                            key={c.provider + c.bookmaker + c.market}
                          >
                            {c.bookmaker} · {c.market}
                            <br />
                            {c.market === "h2h"
                              ? `Market home win ${fmt((c.market_home_probability || 0) * 100)}%`
                              : `Line ${signed(c.line!)} · model difference ${signed(c.model_difference)}`}
                            <br />
                            {c.market_overround == null
                              ? "Bookmaker overround unavailable"
                              : `Bookmaker overround ${fmt(c.market_overround * 100, 2)}%`}
                            <br />
                            Captured {kick(c.captured_at)}
                            <br />
                            Updated {kick(c.updated_at)}
                            {c.direction_result && (
                              <>
                                <br />
                                Hypothetical direction: {c.direction_result}
                              </>
                            )}
                          </p>
                        ))}
                      </details>
                    ) : (
                      <span className="note">No qualifying quote</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="empty">No registered games match these filters.</p>
        )}
        <div className="pagination">
          <span>
            {rows.length.toLocaleString()} games · page {page + 1} of{" "}
            {Math.max(1, Math.ceil(rows.length / 25))}
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
              disabled={(page + 1) * 25 >= rows.length}
              onClick={() => setPage(page + 1)}
            >
              Next →
            </button>
          </div>
        </div>
        <p className="note">
          Positive margins favor the designated home team, including neutral
          sites. Game rows use the first eligible registration; when none
          qualifies, the first excluded version remains visible. Quotes are last
          observed, not live prices.
        </p>
      </section>
    </>
  );
}
