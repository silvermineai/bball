"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { fmt } from "../../_lib/format";

type Field = { category: "general" | "offensive" | "defensive"; key: string; label: string; unit: "per game" | "percent" | "count" | "ratio" };
type Row = { id: string; team: string; abbreviation: string | null; value: number | null; display: string | null };
type Result = { season: number; field: Field; page: number; page_size: number; total: number; non_null: number; rows: Row[] };
const labels = { general: "General", offensive: "Offensive", defensive: "Defensive" };
function shown(row: Row, field: Field) {
  if (row.value == null && row.display == null) return "—";
  if (field.unit === "percent" && row.value != null) return `${fmt(row.value, 1)}%`;
  if (row.value != null) return fmt(row.value, field.unit === "ratio" ? 2 : 1);
  return row.display || "—";
}

export default function TeamStats() {
  const [fields, setFields] = useState<Field[]>([]), [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState("2026"), [fieldKey, setFieldKey] = useState("offensive:avgPoints");
  const [query, setQuery] = useState(""), [direction, setDirection] = useState<"desc" | "asc">("desc"), [page, setPage] = useState(0);
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState(""), [copied, setCopied] = useState(""), [hydrated, setHydrated] = useState(false), [exporting, setExporting] = useState(false), [exportMessage, setExportMessage] = useState("");
  const field = useMemo(() => fields.find((f) => `${f.category}:${f.key}` === fieldKey) || null, [fields, fieldKey]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const category = params.get("category");
    const stat = params.get("stat");
    if (category && stat) setFieldKey(`${category}:${stat}`);
    if (params.get("season")) setSeason(params.get("season")!);
    setQuery(params.get("q") || "");
    setDirection(params.get("direction") === "asc" ? "asc" : "desc");
    const requestedPage = Number(params.get("page"));
    if (Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage < 10000) setPage(requestedPage);
    setHydrated(true);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/team-stats?meta=1", { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error("The team-field catalog is unavailable."); return r.json() as Promise<{ seasons: number[]; fields: Field[] }>; }).then((p) => { setFields(p.fields); setSeasons(p.seasons); if (p.seasons.length && !p.seasons.includes(Number(season))) setSeason(String(p.seasons[0])); }).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
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
    if (query.trim()) url.searchParams.set("q", query.trim()); else url.searchParams.delete("q");
    if (direction === "asc") url.searchParams.set("direction", direction); else url.searchParams.delete("direction");
    if (page) url.searchParams.set("page", String(page)); else url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
  }, [direction, field, hydrated, page, query, season]);
  useEffect(() => {
    if (!field) return;
    const controller = new AbortController(); setResult(null); setError("");
    const params = new URLSearchParams({ season, category: field.category, stat: field.key, page: String(page), direction }); if (query.trim()) params.set("q", query.trim());
    fetch(`/api/basketball/research/team-stats?${params}`, { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error("The team statistics could not be loaded. Please reload."); return r.json() as Promise<Result>; }).then(setResult).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [field, season, page, direction, query]);
  const grouped = useMemo(() => fields.reduce<Record<string, Field[]>>((g, f) => { (g[f.category] ||= []).push(f); return g; }, {}), [fields]);
  const reset = (fn: () => void) => { setPage(0); fn(); };
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied("Team stat link copied."); }
    catch { setCopied("Copy the filtered URL from your address bar."); }
  };
  const exportHeaders = ["Season", "Source category", "Source field", "Field unit", "Program", "Source ID", "Program archive URL", "Abbreviation", "Displayed value", "Raw numeric value"];
  const exportRow = (row: Row, active: Result) => [active.season, active.field.category, active.field.key, active.field.unit, row.team, row.id, `https://bball.silvermine.dev/basketball/programs/${encodeURIComponent(row.id)}/`, row.abbreviation, row.display, row.value];
  const download = () => {
    if (!result) return;
    downloadCsv(`team-${result.field.key}-${season}-page-${page + 1}.csv`, toCsv(exportHeaders, result.rows.map((row) => exportRow(row, result))));
  };
  const downloadAll = async () => {
    if (!result || !field || exporting) return;
    const totalPages = Math.ceil(result.total / result.page_size);
    if (totalPages > 1001) {
      setExportMessage("This cohort exceeds the bounded export window. Search for a program first.");
      return;
    }
    setExporting(true);
    setExportMessage(`Preparing 0 of ${result.total.toLocaleString()} team records…`);
    try {
      const rows: Row[] = [];
      for (let requestedPage = 0; requestedPage < totalPages; requestedPage += 1) {
        const params = new URLSearchParams({ season, category: field.category, stat: field.key, page: String(requestedPage), direction });
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(`/api/basketball/research/team-stats?${params}`);
        if (!response.ok) throw new Error("The complete team-stat export could not be loaded.");
        const payload = await response.json() as Result;
        rows.push(...payload.rows);
        setExportMessage(`Preparing ${rows.length.toLocaleString()} of ${result.total.toLocaleString()} team records…`);
      }
      downloadCsv(`team-${field.key}-${season}-all.csv`, toCsv(exportHeaders, rows.map((row) => exportRow(row, result))));
      setExportMessage(`Downloaded ${rows.length.toLocaleString()} team-season records.`);
    } catch (reason) {
      setExportMessage(reason instanceof Error ? reason.message : "The complete team-stat export could not be loaded.");
    } finally {
      setExporting(false);
    }
  };
  return <>
    <div className="page-title"><div className="eyebrow">Source archive / attributed team-season release</div><h1>See how every<br /><em>program plays.</em></h1><p>Search the aggregate team-season fields retained from the publisher release. Use the archive for context and scouting; Silvermine ratings and forecasts remain separate model artifacts.</p></div>
    <div className="strip"><div><strong>{result?.total.toLocaleString() ?? "—"}</strong><span>Team records in view</span></div><div><strong>{result?.non_null.toLocaleString() ?? "—"}</strong><span>Records with this source field</span></div><div><strong>{fields.length || "—"}</strong><span>Retained source fields</span></div><div><strong>{seasons.length || "—"}</strong><span>Available source seasons</span></div></div>
    <div className="toolbar"><label className="control"><span>SOURCE SEASON</span><select value={season} onChange={(e) => reset(() => setSeason(e.target.value))}>{!seasons.length && <option value={season}>{season}</option>}{seasons.map((s) => <option key={s} value={s}>{s - 1}–{String(s).slice(-2)}</option>)}</select></label><label className="control"><span>SOURCE FIELD</span><select value={fieldKey} onChange={(e) => reset(() => setFieldKey(e.target.value))}>{Object.entries(grouped).map(([category, candidates]) => <optgroup key={category} label={labels[category as keyof typeof labels]}>{candidates.map((f) => <option key={`${f.category}:${f.key}`} value={`${f.category}:${f.key}`}>{f.label}</option>)}</optgroup>)}</select></label><label className="control"><span>PROGRAM</span><input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search programs" /></label><label className="control"><span>ORDER</span><select value={direction} onChange={(e) => reset(() => setDirection(e.target.value as "desc" | "asc"))}><option value="desc">Highest first</option><option value="asc">Lowest first</option></select></label><button className="button secondary" type="button" onClick={share}>Copy stat link</button></div>
    {(copied || exportMessage) && <p className="note" role="status">{copied || exportMessage}</p>}
    {field && <p className="note" style={{ marginBottom: 20 }}><strong>{field.label}</strong> · {field.unit}. Values and display strings come directly from the attributed publisher release.</p>}
    {error ? <p role="alert" className="status-error">{error}</p> : !result ? <p role="status" className="empty">Loading team statistics…</p> : <><div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} matching teams · page {page + 1} of {Math.max(1, Math.ceil(result.total / result.page_size))}</p><div className="button-row"><button className="button secondary" type="button" onClick={download}>Download page CSV ↓</button><button className="button secondary" type="button" onClick={downloadAll} disabled={exporting}>{exporting ? "Preparing full CSV…" : "Download all matching CSV ↓"}</button></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Program</th><th>Source ID</th><th>Abbr.</th><th className="numeric">{result.field.label}</th></tr></thead><tbody>{result.rows.map((r) => <tr key={r.id}><td><Link href={`/basketball/programs/${r.id}/`}>{r.team}</Link></td><td><small>{r.id}</small></td><td>{r.abbreviation || "—"}</td><td className="numeric"><strong>{shown(r, result.field)}</strong></td></tr>)}</tbody></table></div>{!result.rows.length && <p className="empty">No teams match these filters.</p>}<div className="pagination"><span>{result.total.toLocaleString()} records · publisher values remain attributable</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={(page + 1) * result.page_size >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div></div></>}
    <p className="note" style={{ marginTop: 24 }}>Source: SportsDataverse attributed ESPN team-season statistics, published under CC BY 4.0. This archive includes every team observed by the release and does not imply division, eligibility or a Silvermine rating.</p>
  </>;
}
