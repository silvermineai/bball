"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { date, fmt } from "../../_lib/format";

type Field = {
  category: "averages" | "totals" | "miscellaneous";
  key: string;
  label: string;
  unit: "per game" | "percent" | "count" | "ratio" | "text";
};
type Row = {
  id: string;
  name: string | null;
  position: string | null;
  team_id: string;
  team: string;
  value: number | null;
  display: string | null;
  games: number | null;
};
type Result = {
  season: number;
  field: Field;
  page: number;
  page_size: number;
  total: number;
  non_null: number;
  source_receipts: Array<{ dataset: string; season: number; url: string; fetched_at: string; sha256: string }>;
  rows: Row[];
};

const categoryLabels: Record<Field["category"], string> = {
  averages: "Averages",
  totals: "Totals",
  miscellaneous: "Miscellaneous",
};

function shown(row: Row, field: Field) {
  if (row.display == null && row.value == null) return "—";
  if (field.unit === "percent" && row.value != null) return `${fmt(row.value, 1)}%`;
  if (row.value != null && field.unit !== "text") return fmt(row.value, field.unit === "ratio" ? 2 : 1);
  return row.display || "—";
}

export default function SourceStats() {
  const [fields, setFields] = useState<Field[]>([]);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState("2026");
  const [fieldKey, setFieldKey] = useState("averages:avgPoints");
  const [query, setQuery] = useState("");
  const [minGames, setMinGames] = useState("0");
  const [direction, setDirection] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const field = useMemo(
    () => fields.find((candidate) => `${candidate.category}:${candidate.key}` === fieldKey) || null,
    [fields, fieldKey],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const category = params.get("category");
    const stat = params.get("stat");
    if (category && stat) setFieldKey(`${category}:${stat}`);
    if (params.get("season")) setSeason(params.get("season")!);
    setQuery(params.get("q") || "");
    const requestedMinGames = Number(params.get("minGames") || 0);
    if (Number.isInteger(requestedMinGames) && requestedMinGames >= 0 && requestedMinGames <= 50) setMinGames(String(requestedMinGames));
    setDirection(params.get("direction") === "asc" ? "asc" : "desc");
    const requestedPage = Number(params.get("page"));
    if (Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage < 10000) setPage(requestedPage);
    setHydrated(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/publisher-stats?meta=1", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The source-field catalog is unavailable.");
        return response.json() as Promise<{ seasons: number[]; fields: Field[] }>;
      })
      .then((payload) => {
        setFields(payload.fields);
        setSeasons(payload.seasons);
        if (payload.seasons.length && !payload.seasons.includes(Number(season))) setSeason(String(payload.seasons[0]));
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!fields.length || fields.some((candidate) => `${candidate.category}:${candidate.key}` === fieldKey)) return;
    setFieldKey(`${fields[0].category}:${fields[0].key}`);
  }, [fieldKey, fields]);

  useEffect(() => {
    if (!hydrated || !field) return;
    const url = new URL(window.location.href);
    url.searchParams.set("season", season);
    url.searchParams.set("category", field.category);
    url.searchParams.set("stat", field.key);
    if (query.trim()) url.searchParams.set("q", query.trim());
    else url.searchParams.delete("q");
    if (minGames !== "0") url.searchParams.set("minGames", minGames);
    else url.searchParams.delete("minGames");
    if (direction === "asc") url.searchParams.set("direction", direction);
    else url.searchParams.delete("direction");
    if (page) url.searchParams.set("page", String(page));
    else url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
  }, [direction, field, hydrated, minGames, page, query, season]);

  useEffect(() => {
    if (!field) return;
    const controller = new AbortController();
    setResult(null);
    setError("");
    const params = new URLSearchParams({
      season,
      category: field.category,
      stat: field.key,
      page: String(page),
      direction,
      });
    if (query.trim()) params.set("q", query.trim());
    if (minGames !== "0") params.set("min_games", minGames);
    fetch(`/api/basketball/research/publisher-stats?${params}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The source statistics could not be loaded. Please reload.");
        return response.json() as Promise<Result>;
      })
      .then(setResult)
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, [field, season, page, direction, query, minGames]);

  const grouped = useMemo(
    () => fields.reduce<Record<string, Field[]>>((groups, candidate) => {
      (groups[candidate.category] ||= []).push(candidate);
      return groups;
    }, {}),
    [fields],
  );
  const reset = (callback: () => void) => {
    setPage(0);
    callback();
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Source stat link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };
  const exportRows = result?.rows || [];
  const exportAll = async () => {
    if (!result || exporting) return;
    const pages = Math.ceil(result.total / result.page_size);
    if (pages > 251) {
      setExportMessage("This slice is larger than the bounded export window. Add a search or minimum-games filter first.");
      return;
    }
    setExporting(true);
    setExportMessage(`Preparing 0 of ${result.total.toLocaleString()} rows…`);
    try {
      const rows: Row[] = [];
      for (let requestedPage = 0; requestedPage < pages; requestedPage += 1) {
        const params = new URLSearchParams({ season, category: result.field.category, stat: result.field.key, page: String(requestedPage), direction });
        if (query.trim()) params.set("q", query.trim());
        if (minGames !== "0") params.set("min_games", minGames);
        const response = await fetch(`/api/basketball/research/publisher-stats?${params}`);
        if (!response.ok) throw new Error("The complete source export could not be loaded.");
        const payload = await response.json() as Result;
        rows.push(...payload.rows);
        setExportMessage(`Preparing ${rows.length.toLocaleString()} of ${result.total.toLocaleString()} rows…`);
      }
      const receipt = result.source_receipts[0];
      downloadCsv(
        `publisher-${result.field.key}-${season}-all.csv`,
        toCsv(["Player", "Source ID", "Program", "Program ID", "Position", "Games", result.field.label, "Raw numeric value", "Source release URL", "Source retrieved", "Source SHA-256"], rows.map((row) => [row.name, row.id, row.team, row.team_id, row.position, row.games, shown(row, result.field), row.value, receipt?.url, receipt?.fetched_at, receipt?.sha256])),
      );
      setExportMessage(`Downloaded ${rows.length.toLocaleString()} matching rows.`);
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : "The complete source export could not be loaded.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">Source archive / attributed player-season release</div>
        <h1>
          Read the whole
          <br />
          <em>stat sheet.</em>
        </h1>
        <p>
          Search every player-season record and every numeric or publisher-formatted field retained from the source release. The browser keeps the source labels, display strings and definitions intact.
        </p>
      </div>
      <div className="strip">
        <div><strong>{result?.total.toLocaleString() ?? "—"}</strong><span>Player/program records in view</span></div>
        <div><strong>{result?.non_null.toLocaleString() ?? "—"}</strong><span>Records with this source field</span></div>
        <div><strong>{fields.length || "—"}</strong><span>Retained source fields</span></div>
        <div><strong>{seasons.length || "—"}</strong><span>Available source seasons</span></div>
      </div>
      <div className="toolbar">
        <label className="control">
          <span>SOURCE SEASON</span>
          <select value={season} onChange={(event) => reset(() => setSeason(event.target.value))}>
            {!seasons.length && <option value={season}>{season}</option>}
            {seasons.map((value) => <option key={value} value={value}>{value - 1}–{String(value).slice(-2)}</option>)}
          </select>
        </label>
        <label className="control">
          <span>SOURCE FIELD</span>
          <select value={fieldKey} onChange={(event) => reset(() => setFieldKey(event.target.value))}>
            {Object.entries(grouped).map(([category, candidates]) => (
              <optgroup key={category} label={categoryLabels[category as Field["category"]]}>
                {candidates.map((candidate) => <option key={`${candidate.category}:${candidate.key}`} value={`${candidate.category}:${candidate.key}`}>{candidate.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="control">
          <span>PLAYER OR PROGRAM</span>
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search names or programs" />
        </label>
        <label className="control">
          <span>MINIMUM GAMES</span>
          <select value={minGames} onChange={(event) => reset(() => setMinGames(event.target.value))}>
            <option value="0">All records</option>
            <option value="5">5+ games</option>
            <option value="10">10+ games</option>
            <option value="15">15+ games</option>
            <option value="20">20+ games</option>
            <option value="30">30+ games</option>
          </select>
        </label>
        <label className="control">
          <span>ORDER</span>
          <select value={direction} onChange={(event) => reset(() => setDirection(event.target.value as "desc" | "asc"))}>
            <option value="desc">Highest first</option>
            <option value="asc">Lowest first</option>
          </select>
        </label>
        <button className="button secondary" type="button" onClick={share}>Copy stat link</button>
      </div>
      {copied && <p className="note" role="status">{copied}</p>}
      {field && <p className="note" style={{ marginBottom: 20 }}><strong>{field.label}</strong> · {field.unit}. The value and definition come from the attributed publisher; source percentages are shown in the publisher’s 0–100 scale. Compound made-attempted fields remain display strings and sort alphabetically. {minGames !== "0" ? `Showing source records with at least ${minGames} games played.` : "Use the minimum-games filter to remove very small samples."}</p>}
      {error ? <p role="alert" className="status-error">{error}</p> : !result ? <p role="status" className="empty">Loading source statistics…</p> : (
        <>
          {result.source_receipts.length > 0 && <details className="paper-panel" style={{ marginBottom: 22 }}><summary><strong>Source receipts for the {result.season} edition</strong> · {result.source_receipts.length} release{result.source_receipts.length === 1 ? "" : "s"}</summary><div className="table-scroll" style={{ marginTop: 16 }}><table className="data-table"><thead><tr><th>Dataset</th><th>Retrieved</th><th>SHA-256</th><th>Release</th></tr></thead><tbody>{result.source_receipts.map((receipt) => <tr key={`${receipt.dataset}-${receipt.season}`}><td>Publisher player-season stats</td><td>{date(receipt.fetched_at)}</td><td className="mono">{receipt.sha256.slice(0, 16)}…</td><td><a href={receipt.url} target="_blank" rel="noreferrer">Open release ↗</a></td></tr>)}</tbody></table></div></details>}
          <div className="section-heading" style={{ marginBottom: 20 }}>
            <p>{result.total.toLocaleString()} matching records · page {page + 1} of {Math.max(1, Math.ceil(result.total / result.page_size))}</p>
            <div className="button-row"><button className="button secondary" type="button" onClick={() => downloadCsv(`publisher-${result.field.key}-${season}.csv`, toCsv(["Player", "Source ID", "Program", "Program ID", "Position", "Games", result.field.label, "Raw numeric value"], exportRows.map((row) => [row.name, row.id, row.team, row.team_id, row.position, row.games, shown(row, result.field), row.value])))}>Download page CSV ↓</button><button className="button secondary" type="button" onClick={exportAll} disabled={exporting}>{exporting ? "Preparing full CSV…" : "Download all matching CSV ↓"}</button></div>
          </div>
          {exportMessage && <p className="note" role="status">{exportMessage}</p>}
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Player</th><th>Program</th><th>Pos.</th><th className="numeric">Games</th><th className="numeric">{result.field.label}</th></tr></thead>
              <tbody>{result.rows.map((row) => <tr key={`${row.id}-${row.team_id}`}>
                <td><Link href={`/basketball/player/?id=${row.id}&season=${season}`}>{row.name || row.id}</Link><small>Source ID {row.id}</small><small><a href={`https://www.espn.com/mens-college-basketball/player/_/id/${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer">ESPN source ↗</a></small></td>
                <td><Link href={`/basketball/programs/${row.team_id}/`}>{row.team}</Link><small>{row.team_id}</small></td>
                <td>{row.position || "—"}</td>
                <td className="numeric">{row.games == null ? "—" : fmt(row.games, 0)}</td>
                <td className="numeric"><strong>{shown(row, result.field)}</strong></td>
              </tr>)}</tbody>
            </table>
          </div>
          {!result.rows.length && <p className="empty">No source records match these filters.</p>}
          <div className="pagination"><span>{result.total.toLocaleString()} records · source field values remain auditable on each player page</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={(page + 1) * result.page_size >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div></div>
        </>
      )}
      <p className="note" style={{ marginTop: 24 }}>Source: SportsDataverse attributed player-season statistics, published under CC BY 4.0. A source identity is not a verified unique person, current roster, eligibility ruling or recruiting rating. <Link href="/basketball/leaders/">See national leaderboards →</Link></p>
    </>
  );
}
