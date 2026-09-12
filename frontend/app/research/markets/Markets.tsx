"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { date, fmt } from "../../_lib/format";
import { normalizeMarketSeason } from "../../_lib/market-view";

type Meta = {
  seasons: number[];
  total: number;
  pregame: number;
  source?: string;
  unavailable_reason?: string;
  unavailable_sources?: string[];
  provider_capabilities?: Array<{
    provider: string;
    markets: string[];
    provider_update_clock: boolean;
    docs_url: string;
    policy: string;
  }>;
  archive_receipts?: Array<{
    dataset: string;
    season: number;
    url: string;
    fetched_at: string;
    sha256: string;
    attribution?: {
      name?: string;
      url?: string;
      license?: string;
      license_url?: string;
      upstream?: string;
    };
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
  updated_at: string | null;
  source: string | null;
  is_pregame: number;
  market?: string | null;
  bookmaker?: string | null;
  provider?: string | null;
};
type Result = { season: number | "all"; page: number; page_size: number; total: number; rows: Row[]; source?: string; unavailable_reason?: string; unavailable_sources?: string[] };

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
  const [copied, setCopied] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const archiveUnavailable = meta?.source === "unavailable" || data?.source === "unavailable";
  const archivePartial = meta?.source === "partial" || data?.source === "partial";
  const unavailableSources = Array.from(new Set([...(meta?.unavailable_sources || []), ...(data?.unavailable_sources || [])]));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSport = params.get("sport");
    if (requestedSport === "football" || requestedSport === "basketball") {
      setSport(requestedSport);
    }
    if (params.get("season")) setSeason(params.get("season")!);
    setQuery(params.get("q") || "");
    const requestedPage = Number(params.get("page"));
    if (Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage < 10000) {
      setPage(requestedPage);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    fetch(`/api/research/markets?meta=1&sport=${sport}`)
      .then((r) => {
        if (!r.ok) throw Error("The market archive could not be loaded.");
        return r.json() as Promise<Meta>;
      })
      .then((value) => {
        setMeta(value);
        const nextSeason = normalizeMarketSeason(season, value.seasons);
        if (nextSeason !== season) setSeason(nextSeason);
      })
      .catch((e) => setError(e.message));
  }, [sport]);

  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    url.searchParams.set("sport", sport);
    url.searchParams.set("season", season);
    if (query.trim()) url.searchParams.set("q", query.trim());
    else url.searchParams.delete("q");
    if (page) url.searchParams.set("page", String(page));
    else url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
  }, [hydrated, page, query, season, sport]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Market archive link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };

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

  const headers = ["season", "away", "home", "kickoff", "market", "home_spread", "total", "home_price_decimal", "away_price_decimal", "over_price_decimal", "under_price_decimal", "home_implied_probability", "observed_at", "updated_at", "source", "is_pregame"];
  const rowValues = (r: Row) => [r.season, r.away_name, r.home_name, r.kickoff, r.market, r.home_spread, r.total, r.home_price, r.away_price, r.over_price, r.under_price, homeImplied(r), r.observed_at, r.updated_at, r.source, r.is_pregame];
  const downloadRows = (rows: Row[], filename: string) => {
    const lines = [headers, ...rows.map(rowValues)];
    const csv = lines.map((line) => line.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const download = () => {
    if (!data) return;
    downloadRows(data.rows, `${sport}-market-archive-${season}-page-${page + 1}.csv`);
  };
  const downloadAll = async () => {
    if (!data || exporting) return;
    const totalPages = Math.ceil(data.total / data.page_size);
    if (totalPages > 1001) {
      setExportMessage("This filtered archive exceeds the bounded export window. Add a team or source filter first.");
      return;
    }
    setExporting(true);
    setExportMessage(`Preparing 0 of ${data.total.toLocaleString()} observations…`);
    try {
      const rows: Row[] = [];
      for (let requestedPage = 0; requestedPage < totalPages; requestedPage += 1) {
        const params = new URLSearchParams({ sport, season, page: String(requestedPage) });
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(`/api/research/markets?${params}`);
        if (!response.ok) throw new Error("The complete market archive could not be loaded.");
        const payload = await response.json() as Result;
        rows.push(...payload.rows);
        setExportMessage(`Preparing ${rows.length.toLocaleString()} of ${data.total.toLocaleString()} observations…`);
      }
      downloadRows(rows, `${sport}-market-archive-${season}-all.csv`);
      setExportMessage(`Downloaded ${rows.length.toLocaleString()} market observations.`);
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : "The complete market archive could not be loaded.");
    } finally {
      setExporting(false);
    }
  };

  const pages = useMemo(() => Math.max(1, Math.ceil((data?.total || 0) / 40)), [data]);
  return (
    <section className="section" aria-label="Historical market archive">
      <div className="paper-panel brief-archive-note">
        <strong>Archive status: historical reference.</strong>
        <p>
          {archiveUnavailable
            ? "The market archive read is temporarily unavailable; zero counts are not evidence that no lines exist."
            : meta ? `${meta.total.toLocaleString()} retained observations across ${meta.seasons.length} seasons. ${meta.pregame || 0} records currently carry the pregame flag.` : "Loading archive coverage…"} Rows are excluded from prospective odds evaluation until their timing evidence qualifies.
        </p>
        {archivePartial ? <p className="note" role="status">This archive read is partial while {unavailableSources.length ? unavailableSources.join(", ") : "one binding"} is busy. Counts reflect only the source that answered; missing observations remain unavailable.</p> : null}
        {meta?.provider_capabilities?.length ? <div className="recruiting-intake-detail" aria-label="Market provider capabilities">
          {meta.provider_capabilities.map((capability) => <span key={capability.provider}>
            <strong>{capability.provider}</strong> · {capability.markets.join(", ")} · {capability.provider_update_clock ? "provider update clock required" : "capture clock only"} · <a href={capability.docs_url} target="_blank" rel="noreferrer">API reference ↗</a>
          </span>)}
        </div> : null}
        {meta?.archive_receipts?.length ? <details className="note" style={{ marginTop: 14 }}>
          <summary>Retained archive source receipts</summary>
          <div className="table-scroll" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead><tr><th>Dataset</th><th>Season</th><th>Fetched (UTC)</th><th>SHA-256</th><th>Attribution</th></tr></thead>
              <tbody>{meta.archive_receipts.map((receipt) => <tr key={`${receipt.dataset}-${receipt.season}`}>
                <th><a href={receipt.url} target="_blank" rel="noreferrer">{receipt.dataset.replaceAll("_", " ")} ↗</a></th>
                <td>{receipt.season}</td>
                <td>{clock(receipt.fetched_at)}</td>
                <td><code>{receipt.sha256}</code></td>
                <td>{receipt.attribution?.name || "Source publisher"}{receipt.attribution?.license ? ` · ${receipt.attribution.license}` : ""}{receipt.attribution?.upstream ? <small>{receipt.attribution.upstream}</small> : null}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p style={{ marginTop: 12 }}>Receipts identify the retained release behind the archive. Historical rows without a verified pregame capture clock remain reference evidence and do not enter prospective betting evaluation.</p>
        </details> : null}
      </div>
      <div className="toolbar">
        <label className="control"><span>SPORT</span><select value={sport} onChange={(e) => { setSport(e.target.value as typeof sport); setPage(0); setSeason("2025"); }}><option value="football">College football</option><option value="basketball">Men&apos;s college basketball</option></select></label>
        <label className="control"><span>SEASON</span><select value={season} onChange={(e) => { setSeason(e.target.value); setPage(0); }}><option value="all">All retained seasons</option>{(meta?.seasons || [2025]).map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="control"><span>TEAM OR SOURCE</span><input type="search" maxLength={120} placeholder="Try Alabama or SportsDataverse" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
        <button className="button secondary" type="button" onClick={download} disabled={!data?.rows.length}>Download page CSV</button>
        <button className="button secondary" type="button" onClick={downloadAll} disabled={!data?.rows.length || exporting}>{exporting ? "Preparing full CSV…" : "Download all matching CSV"}</button>
        <button className="button secondary" type="button" onClick={share}>Copy archive link</button>
      </div>
      {(copied || exportMessage) && <p className="note" role="status">{copied || exportMessage}</p>}
      {error ? <div className="status-error" role="alert">{error}</div> : !data ? <p className="empty" role="status">Loading retained observations…</p> : <>
        <p className="note" role="status">{archiveUnavailable ? "Archive read unavailable; no rows were returned." : `${data.total.toLocaleString()} observations · page ${page + 1} of ${pages} · every row labelled as archival reference`}</p>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Matchup</th><th>Kickoff</th><th>Market</th><th>Observed line / price</th><th>Captured</th><th>Provider update</th><th>Source / status</th></tr></thead><tbody>{data.rows.map((r) => { const implied = homeImplied(r); return <tr key={`${r.game_id}-${r.observed_at}-${r.source}-${r.market || "archive"}`}><td><strong>{r.away_name}</strong><br /><span className="muted">at {r.home_name}</span><small><Link href={`/research/game/?sport=${encodeURIComponent(sport)}&id=${encodeURIComponent(r.game_id)}`}>Open forecast history →</Link></small></td><td>{r.kickoff ? date(r.kickoff) : "—"}</td><td>{r.market || "spread / total"}{r.bookmaker && <small>{r.bookmaker}</small>}</td><td className="numeric">{r.market === "totals" ? <>{`O/U ${fmt(r.total)}`}<small>Over {price(r.over_price)} · Under {price(r.under_price)}</small></> : r.market === "h2h" ? <>{`Home ${price(r.home_price)} · Away ${price(r.away_price)}`}{implied != null && <small>{`Home implied ${(implied * 100).toFixed(1)}%`}</small>}</> : <>{fmt(r.home_spread)}<small>Home {price(r.home_price)} · Away {price(r.away_price)}</small></>}</td><td>{clock(r.observed_at)}</td><td>{clock(r.updated_at)}{!r.updated_at && <small>Provider clock unavailable</small>}</td><td><small>{r.source || "Unattributed source"}</small><br /><span className="status-pill">Archival reference · excluded from prospective evaluation</span></td></tr>; })}</tbody></table></div>
        {!data.rows.length && data.total === 0 && !query.trim() && (
          <div className="paper-panel" role="status" style={{ marginTop: 20 }}>
            <div className="eyebrow">Connector status</div>
            <h3>{archiveUnavailable ? "The market archive is temporarily unavailable." : sport === "basketball" ? "No basketball quote feed is connected yet." : "No market observations are connected yet."}</h3>
            <p>
              {archiveUnavailable
                ? "The warehouse did not answer within the read window. Retry later; this response is not a claim about provider coverage."
                : <>The archive is empty for this sport because no authorized provider
              export has been ingested. This is unavailable evidence, not proof
              that a game had no line. The prospective scorecard stays clean
              until a provider ID, timing clocks and exact participants arrive.</>}
            </p>
            <div className="button-row">
              <a className="button secondary" href={sport === "basketball" ? "/basketball/forecast-lab/" : "/research/scorecard/?sport=football"}>
                {sport === "basketball" ? "Open forecast lab + line checker →" : "Open football scorecard →"}
              </a>
              <a className="hero-link" href="#csv-import">Read the authorized import path →</a>
            </div>
          </div>
        )}
        {!data.rows.length && (data.total > 0 || query.trim()) && <p className="empty">No retained rows match this search.</p>}
        <div className="pagination"><button className="button secondary" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button className="button secondary" disabled={page + 1 >= pages} onClick={() => setPage((n) => n + 1)}>Next</button></div>
      </>}
    </section>
  );
}
