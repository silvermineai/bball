"use client";

import { useEffect, useMemo, useState } from "react";
import { date, fmt } from "../../_lib/format";

type Meta = {
  seasons: number[];
  total: number;
  pregame: number;
  provider_capabilities?: Array<{
    provider: string;
    markets: string[];
    provider_update_clock: boolean;
    docs_url: string;
    policy: string;
  }>;
};
type Row = {
  game_id: string;
  season: number;
  kickoff: string | null;
  home_name: string;
  away_name: string;
  home_spread: number | null;
  total: number | null;
  home_price: number | null;
  away_price: number | null;
  over_price: number | null;
  under_price: number | null;
  observed_at: string | null;
  source: string | null;
  is_pregame: number;
  market?: string | null;
  bookmaker?: string | null;
  provider?: string | null;
};
type Result = { season: number; page: number; page_size: number; total: number; rows: Row[] };

const clock = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(new Date(value)) + " UTC"
    : "—";

const price = (value: number | null) => value == null ? "—" : value.toFixed(2);
const homeImplied = (row: Row) => {
  if (row.home_price == null || row.away_price == null) return null;
  const home = 1 / row.home_price;
  const away = 1 / row.away_price;
  return home / (home + away);
};

export default function Markets() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [sport, setSport] = useState<"football" | "basketball">("football");
  const [season, setSeason] = useState("2025");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/research/markets?meta=1&sport=${sport}`)
      .then((r) => {
        if (!r.ok) throw Error("The market archive could not be loaded.");
        return r.json() as Promise<Meta>;
      })
      .then((value) => {
        setMeta(value);
        if (value.seasons.length && !value.seasons.includes(Number(season)))
          setSeason(String(value.seasons[0]));
      })
      .catch((e) => setError(e.message));
  }, [sport]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    const params = new URLSearchParams({ sport, season, page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/research/markets?${params}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error("The market archive could not be loaded.");
        return r.json() as Promise<Result>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [sport, season, query, page]);

  const download = () => {
    if (!data) return;
    const lines = [
      ["season", "away", "home", "kickoff", "market", "home_spread", "total", "home_price_decimal", "away_price_decimal", "over_price_decimal", "under_price_decimal", "home_implied_probability", "observed_at", "source", "is_pregame"],
      ...data.rows.map((r) => [r.season, r.away_name, r.home_name, r.kickoff, r.market, r.home_spread, r.total, r.home_price, r.away_price, r.over_price, r.under_price, homeImplied(r), r.observed_at, r.source, r.is_pregame]),
    ];
    const csv = lines.map((line) => line.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sport}-market-archive-${season}-page-${page + 1}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const pages = useMemo(() => Math.max(1, Math.ceil((data?.total || 0) / 40)), [data]);
  return (
    <section className="section" aria-label="Historical market archive">
      <div className="paper-panel brief-archive-note">
        <strong>Archive status: historical reference.</strong>
        <p>
          {meta ? `${meta.total.toLocaleString()} retained observations across ${meta.seasons.length} seasons.` : "Loading archive coverage…"} {meta?.pregame || 0} records currently carry the pregame flag. Rows are excluded from prospective odds evaluation until their timing evidence qualifies.
        </p>
        {meta?.provider_capabilities?.length ? <div className="recruiting-intake-detail" aria-label="Market provider capabilities">
          {meta.provider_capabilities.map((capability) => <span key={capability.provider}>
            <strong>{capability.provider}</strong> · {capability.markets.join(", ")} · {capability.provider_update_clock ? "provider update clock required" : "capture clock only"} · <a href={capability.docs_url} target="_blank" rel="noreferrer">API reference ↗</a>
          </span>)}
        </div> : null}
      </div>
      <div className="toolbar">
        <label className="control"><span>SPORT</span><select value={sport} onChange={(e) => { setSport(e.target.value as typeof sport); setPage(0); setSeason("2025"); }}><option value="football">College football</option><option value="basketball">Men&apos;s college basketball</option></select></label>
        <label className="control"><span>SEASON</span><select value={season} onChange={(e) => { setSeason(e.target.value); setPage(0); }}>{(meta?.seasons || [2025]).map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="control"><span>TEAM OR SOURCE</span><input type="search" maxLength={120} placeholder="Try Alabama or SportsDataverse" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
        <button className="button secondary" type="button" onClick={download} disabled={!data?.rows.length}>Download CSV</button>
      </div>
      {error ? <div className="status-error" role="alert">{error}</div> : !data ? <p className="empty" role="status">Loading retained observations…</p> : <>
        <p className="note" role="status">{data.total.toLocaleString()} observations · page {page + 1} of {pages} · every row labelled as archival reference</p>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Matchup</th><th>Kickoff</th><th>Market</th><th>Observed line / price</th><th>Observed</th><th>Source / status</th></tr></thead><tbody>{data.rows.map((r) => { const implied = homeImplied(r); return <tr key={`${r.game_id}-${r.observed_at}-${r.source}-${r.market || "archive"}`}><td><strong>{r.away_name}</strong><br /><span className="muted">at {r.home_name}</span></td><td>{r.kickoff ? date(r.kickoff) : "—"}</td><td>{r.market || "spread / total"}{r.bookmaker && <small>{r.bookmaker}</small>}</td><td className="numeric">{r.market === "totals" ? <>{`O/U ${fmt(r.total)}`}<small>Over {price(r.over_price)} · Under {price(r.under_price)}</small></> : r.market === "h2h" ? <>{`Home ${price(r.home_price)} · Away ${price(r.away_price)}`}{implied != null && <small>{`Home implied ${(implied * 100).toFixed(1)}%`}</small>}</> : <>{fmt(r.home_spread)}<small>Home {price(r.home_price)} · Away {price(r.away_price)}</small></>}</td><td>{clock(r.observed_at)}</td><td><small>{r.source || "Unattributed source"}</small><br /><span className="status-pill">Archival reference · excluded from prospective evaluation</span></td></tr>; })}</tbody></table></div>
        {!data.rows.length && <p className="empty">No retained rows match this search.</p>}
        <div className="pagination"><button className="button secondary" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={page + 1 >= pages} onClick={() => setPage((n) => n + 1)}>Next</button></div>
      </>}
    </section>
  );
}
