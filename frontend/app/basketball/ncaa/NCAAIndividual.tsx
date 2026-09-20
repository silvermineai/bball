"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useBasketballRelease } from "../../_components/useBasketballRelease";
import { fmt } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";
import {
  ncaaStatLabels,
  ncaaFilterSearch,
  parseNCAAFilters,
  publisherRank,
  sortNCAAPlayers,
  type NCAAIndividualPlayer,
  type NCAAIndividualRelease,
  type NCAAStatKey,
  type NCAADivisionFilter,
  ncaaValueCoverage,
  ncaaLeaderCsvHeaders,
  ncaaLeaderCsvRows,
} from "../../_lib/ncaa-individual";
import { lowerDivisionPlayerHref } from "../../_lib/division-archive-links";

const stats = Object.keys(ncaaStatLabels) as NCAAStatKey[];
const percentStats = new Set<NCAAStatKey>(["fg_pct", "three_pct", "ft_pct"]);
const liveStats = new Set<NCAAStatKey>(stats);

type LiveLeaderResponse = {
  total: number;
  rows: Array<{ payload: NCAAIndividualPlayer }>;
  provenance?: { kind?: string; dataset?: string; source_url?: string; note?: string; publisher_rank?: boolean };
};
type LiveLeaderMeta = {
  season: number;
  coverage: {
    players: number;
    divisions: Record<string, { players: number; [key: string]: number }>;
  };
  provenance?: LiveLeaderResponse["provenance"];
};

const PAGE_SIZE = 40;

export default function NCAAIndividual() {
  const params = useSearchParams();
  const initial = parseNCAAFilters(params.toString());
  const [fallbackRequested, setFallbackRequested] = useState(false);
  const { data, error } = useBasketballRelease<NCAAIndividualRelease>("ncaa-individual", { enabled: fallbackRequested });
  const [division, setDivision] = useState<NCAADivisionFilter>(initial.division);
  const [stat, setStat] = useState<NCAAStatKey>(initial.stat);
  const [query, setQuery] = useState(initial.query);
  const [minGames, setMinGames] = useState(initial.minGames);
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState("");
  const [live, setLive] = useState<{ rows: NCAAIndividualPlayer[]; total: number; provenance?: LiveLeaderResponse["provenance"] } | null>(null);
  const [liveMeta, setLiveMeta] = useState<LiveLeaderMeta | null>(null);
  const [liveError, setLiveError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/ncaa-leaders?meta=1", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Live leaderboard coverage unavailable.");
        return response.json() as Promise<LiveLeaderMeta>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setLiveMeta(value);
      })
      .catch(() => {
        // The data request below owns the user-visible fallback message.
      });
    return () => controller.abort();
  }, [retryNonce]);
  useEffect(() => {
    const next = ncaaFilterSearch({ division, stat, query, minGames });
    if (next !== window.location.search) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
    setPage(0);
    setCopied("");
  }, [division, stat, query, minGames]);
  const staticRows = sortNCAAPlayers(
    (data?.players || []).filter((p) =>
      (division === "all" || p.division === +division) &&
      (minGames === 0 || (p.games != null && p.games >= minGames)) &&
      `${p.name} ${p.team_name || ""} ${p.conference || ""}`.toLowerCase().includes(query.toLowerCase()),
    ),
    stat,
  );
  useEffect(() => {
    if (!liveStats.has(stat)) {
      setLive(null);
      setLiveError("");
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ division, stat, min_games: String(minGames), page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    setLive(null);
    setLiveError("");
    fetch(`/api/basketball/research/ncaa-leaders?${params}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Live leaderboard unavailable; showing the checked-in edition.");
        return response.json() as Promise<LiveLeaderResponse>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setLive({ rows: value.rows.map((row) => row.payload), total: value.total, provenance: value.provenance });
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
          setFallbackRequested(true);
          setLive(null);
          setLiveError(reason instanceof Error ? reason.message : "Live leaderboard unavailable; showing the checked-in edition.");
        }
      });
    return () => controller.abort();
  }, [division, minGames, page, query, retryNonce, stat]);
  const rows = live?.rows || staticRows;
  const totalRows = live?.total ?? staticRows.length;
  const pageRows = live ? rows : rows.slice(page * 40, page * 40 + 40);
  const shown = (p: NCAAIndividualPlayer) => {
    const value = p[stat];
    return value == null ? "—" : fmt(value, percentStats.has(stat) ? 1 : stat === "ast_to" ? 2 : 1);
  };
  const download = () => downloadCsv(`ncaa-leaders-${division}-${stat}-page-${page + 1}.csv`, toCsv(
    ncaaLeaderCsvHeaders,
    ncaaLeaderCsvRows(rows, stat, page * PAGE_SIZE),
  ));
  const downloadAll = async () => {
    if (exporting) return;
    setExporting(true);
    setExportMessage("Preparing the complete filtered leaderboard…");
    try {
      let allRows: NCAAIndividualPlayer[] = [];
      if (live) {
        const totalPages = Math.ceil(totalRows / PAGE_SIZE);
        if (totalPages > 1001) throw new Error("This cohort exceeds the bounded export window. Search for a player or program first.");
        for (let requestedPage = 0; requestedPage < totalPages; requestedPage += 1) {
          const params = new URLSearchParams({ division, stat, min_games: String(minGames), page: String(requestedPage) });
          if (query.trim()) params.set("q", query.trim());
          const response = await fetch(`/api/basketball/research/ncaa-leaders?${params}`);
          if (!response.ok) throw new Error("The complete national leaderboard could not be loaded.");
          const payload = await response.json() as LiveLeaderResponse;
          allRows.push(...payload.rows.map((row) => row.payload));
          setExportMessage(`Preparing ${allRows.length.toLocaleString()} of ${totalRows.toLocaleString()} rows…`);
        }
      } else {
        allRows = staticRows;
      }
      downloadCsv(`ncaa-leaders-${division}-${stat}-all.csv`, toCsv(ncaaLeaderCsvHeaders, ncaaLeaderCsvRows(allRows, stat)));
      setExportMessage(`Downloaded ${allRows.length.toLocaleString()} complete leaderboard rows.`);
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : "The complete national leaderboard could not be loaded.");
    } finally {
      setExporting(false);
    }
  };
  const sourceCoverage = liveMeta?.coverage || data?.coverage;
  const apgSupplement = data?.supplements?.apg;
  const astSupplement = data?.supplements?.ast;
  const boxDerivedSupplement = data?.supplements?.box_derived;
  const boxDerivedCount = boxDerivedSupplement?.values?.[stat];
  const liveDerived = live?.provenance?.kind === "exact_id_derived" || live?.provenance?.kind === "publisher_snapshot_with_exact_id_fill";
  const divisionCount = division === "all"
    ? Object.values(sourceCoverage?.divisions || {}).reduce((sum, d) => sum + d.players, 0)
    : sourceCoverage?.divisions[division]?.players || 0;
  const coverage = data
    ? ncaaValueCoverage(data.players)
    : liveMeta
      ? stats.map((stat) => ({
        stat,
        divisions: {
          1: liveMeta.coverage.divisions["1"]?.[stat] || 0,
          2: liveMeta.coverage.divisions["2"]?.[stat] || 0,
          3: liveMeta.coverage.divisions["3"]?.[stat] || 0,
        },
      }))
      : [];
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Leaderboard link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };
  const retryLiveLeaders = () => {
    setLiveError("");
    setRetryNonce((value) => value + 1);
  };
  return (
    <>
      <div className="toolbar">
        <label className="control"><span>DIVISION</span><select name="ncaa-leader-division" value={division} onChange={(e) => setDivision(e.target.value as NCAADivisionFilter)}><option value="1">Division I</option><option value="2">Division II</option><option value="3">Division III</option><option value="all">All divisions</option></select></label>
        <label className="control"><span>LEADERBOARD</span><select name="ncaa-leader-stat" value={stat} onChange={(e) => setStat(e.target.value as NCAAStatKey)}>{stats.map((key) => <option key={key} value={key}>{ncaaStatLabels[key]}</option>)}</select></label>
        <label className="control"><span>MINIMUM GAMES</span><select name="ncaa-leader-min-games" value={minGames} onChange={(e) => setMinGames(Number(e.target.value))}>{[0, 5, 10, 15, 20].map((games) => <option value={games} key={games}>{games ? `${games}+ games` : "Any recorded games"}</option>)}</select></label>
        <label className="control"><span>PLAYER OR PROGRAM</span><input name="ncaa-leader-search" autoComplete="off" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search national records…" /></label>
        <button className="button secondary" type="button" onClick={share}>Copy leaderboard link</button>
      </div>
      {copied && <p role="status">{copied}</p>}
      {error ? <p role="alert" className="status-error">{error}</p> : !data && !live ? <p role="status" className="empty">Loading national records…</p> : <>
        <div className="strip" style={{ borderTop: "1px solid var(--ink)", marginBottom: 25 }}>
          <div><strong>{(sourceCoverage?.players || 0).toLocaleString()}</strong><span>Published player records</span></div>
          <div><strong>{divisionCount.toLocaleString()}</strong><span>{division === "all" ? "All division records" : `Division ${division} records`}</span></div>
          <div><strong>{(liveMeta?.season || data?.season || 2026) - 1}–{String(liveMeta?.season || data?.season || 2026).slice(-2)}</strong><span>Final statistics season</span></div>
          <div><strong>{data?.generated_at ? new Date(data.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "D1"}</strong><span>Archive snapshot</span></div>
        </div>
        <p className="note" style={{ marginBottom: 20 }}>{live ? `Live record: ${live.provenance?.dataset || "archive edition"}${live.provenance?.publisher_rank === false ? " · this measure is exact-ID derived" : " · retained rank when supplied"}.` : liveError ? <>{liveError} <button className="text-link" type="button" onClick={retryLiveLeaders}>Retry live record</button></> : "Using the checked-in edition while the live record loads."} These are qualifying rows from the final national-ranking archive. Counts vary by statistic and division; a missing value means that edition did not publish a matching row. Assists per game and total assists may be derived supplements from the exact-ID player-box archive when the ranking page is unavailable; the board never creates a rank for those fields. They are leaderboards, not a complete census or a recruiting ranking.</p>
        {stat === "apg" && apgSupplement && (
          <div className="paper-panel" role="status" style={{ marginBottom: 24 }}>
            <strong>Assists per game uses an exact-ID Division I supplement.</strong>
            <p>{apgSupplement.values.toLocaleString()} Division I values for {apgSupplement.season - 1}–{String(apgSupplement.season).slice(-2)} are derived from <em>{apgSupplement.dataset}</em>: {apgSupplement.basis}. {apgSupplement.publisher_rank}. Retained in the archive receipt.</p>
          </div>
        )}
        {stat === "ast" && astSupplement && (
          <div className="paper-panel" role="status" style={{ marginBottom: 24 }}>
            <strong>Total assists uses an exact-ID Division I supplement.</strong>
            <p>{astSupplement.values.toLocaleString()} Division I values for {astSupplement.season - 1}–{String(astSupplement.season).slice(-2)} are derived from <em>{astSupplement.dataset}</em>: {astSupplement.basis}. {astSupplement.publisher_rank}. Retained in the archive receipt.</p>
          </div>
        )}
        {stat !== "apg" && stat !== "ast" && boxDerivedSupplement && boxDerivedCount && (
          <div className="paper-panel" role="status" style={{ marginBottom: 24 }}>
            <strong>{ncaaStatLabels[stat]} includes an exact-ID Division I supplement.</strong>
            <p>{boxDerivedCount.toLocaleString()} missing values for {boxDerivedSupplement.season - 1}–{String(boxDerivedSupplement.season).slice(-2)} are filled from <em>{boxDerivedSupplement.dataset}</em>: {boxDerivedSupplement.basis}. {boxDerivedSupplement.publisher_rank}. Retained in the archive receipt.</p>
          </div>
        )}
        {live && liveDerived && live.provenance?.source_url && (
          <div className="paper-panel" role="status" style={{ marginBottom: 24 }}>
            <strong>{ncaaStatLabels[stat]} live source provenance.</strong>
            <p>{live.provenance.note || "This live measure includes values derived from the exact-ID player-box archive."} Retained in the archive receipt.</p>
          </div>
        )}
        {coverage.find((row) => row.stat === stat && Object.values(row.divisions).every((value) => value === 0)) && (
          <div className="paper-panel source-gap" role="status">
            <strong>{ncaaStatLabels[stat]} is unavailable in this archive snapshot.</strong>
            <p>The edition did not publish qualifying rows for this measure. Nothing is being converted to zero. For an assists ranking built from the player-box archive, open the <a href="/basketball/ncaa-rankings/?metric=apg">player rankings archive →</a></p>
          </div>
        )}
        <details className="career-coverage-details" style={{ marginBottom: 24 }}>
          <summary>Published values by division and measure</summary>
          <p className="note">The matrix counts non-null values in this edition. A blank field is left blank; it is never converted to zero.</p>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Measure</th><th className="numeric">Division I</th><th className="numeric">Division II</th><th className="numeric">Division III</th></tr></thead>
              <tbody>{coverage.map((row) => <tr key={row.stat}><td>{ncaaStatLabels[row.stat]}</td><td className="numeric">{row.divisions[1].toLocaleString()}</td><td className="numeric">{row.divisions[2].toLocaleString()}</td><td className="numeric">{row.divisions[3].toLocaleString()}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
        <div className="section-heading" style={{ marginBottom: 20 }}><p>{totalRows.toLocaleString()} matching records · {rows.filter((p) => p[stat] != null).length.toLocaleString()} values on this page · {ncaaStatLabels[stat]}</p><div className="button-row"><button className="button secondary" type="button" onClick={download}>Download page CSV ↓</button><button className="button secondary" type="button" onClick={downloadAll} disabled={exporting}>{exporting ? "Preparing full CSV…" : "Download all matching CSV ↓"}</button></div></div>
        {exportMessage && <p className="note" role="status">{exportMessage}</p>}
        <p className="note" style={{ marginBottom: 20 }}>View order follows the current division, search and measure filters. Retained rank is shown only when the edition supplied a rank for the selected measure.</p>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>View order</th><th>Rank</th><th>Player</th><th>Program</th><th>Division</th><th>Class / position</th><th className="numeric">{ncaaStatLabels[stat]}</th><th className="numeric">Games</th><th>Retained measures</th></tr></thead><tbody>{pageRows.map((p, i) => <tr key={`${p.division}-${p.player_id}`}><td className="rank-number">{page * 40 + i + 1}</td><td className="rank-number">{publisherRank(p, stat) ?? "—"}</td><td>{p.division === 1 ? <Link href={`/basketball/ncaa-player/?id=${p.player_id}&season=${liveMeta?.season || data?.season || 2026}`}>{p.name} →</Link> : <Link href={lowerDivisionPlayerHref(String(p.division) as "2" | "3", p.player_id)}>{p.name} →</Link>}<small>Archive ID {p.player_id}</small><a className="hero-link" href={`/basketball/players/?season=${liveMeta?.season || data?.season || 2026}&q=${encodeURIComponent(p.name)}`}>Search archive by name →</a></td><td>{p.team_name || "—"}<small>{p.conference || ""}</small></td><td>D{p.division}</td><td>{[p.class_year, p.position, p.height].filter(Boolean).join(" · ") || "—"}</td><td className="numeric">{shown(p)}</td><td className="numeric">{p.games ?? "—"}</td><td>{p.source_stats ? <details><summary>{Object.keys(p.source_stats).length} measures</summary>{Object.entries(p.source_stats).map(([key, evidence]) => <div key={key}><strong>{key}</strong><small>{evidence.headers.join(" · ") || "Archive headers unavailable"}</small><small>{evidence.cells.join(" · ")}</small></div>)}</details> : <span className="muted">Unavailable</span>}</td></tr>)}</tbody></table></div>
        {!rows.length && <p className="empty">No records match that search.</p>}
        <div className="pagination"><span>{totalRows.toLocaleString()} records · page {page + 1} of {Math.max(1, Math.ceil(totalRows / 40))}</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={(page + 1) * 40 >= totalRows} onClick={() => setPage(page + 1)}>Next →</button></div></div>
      </>}
    </>
  );
}
