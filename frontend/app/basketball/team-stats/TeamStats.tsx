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
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState("");
  const field = useMemo(() => fields.find((f) => `${f.category}:${f.key}` === fieldKey) || null, [fields, fieldKey]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/team-stats?meta=1", { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error("The team-field catalog is unavailable."); return r.json() as Promise<{ seasons: number[]; fields: Field[] }>; }).then((p) => { setFields(p.fields); setSeasons(p.seasons); if (p.seasons.length && !p.seasons.includes(Number(season))) setSeason(String(p.seasons[0])); }).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!field) return;
    const controller = new AbortController(); setResult(null); setError("");
    const params = new URLSearchParams({ season, category: field.category, stat: field.key, page: String(page), direction }); if (query.trim()) params.set("q", query.trim());
    fetch(`/api/basketball/research/team-stats?${params}`, { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error("The team statistics could not be loaded. Please reload."); return r.json() as Promise<Result>; }).then(setResult).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [field, season, page, direction, query]);
  const grouped = useMemo(() => fields.reduce<Record<string, Field[]>>((g, f) => { (g[f.category] ||= []).push(f); return g; }, {}), [fields]);
  const reset = (fn: () => void) => { setPage(0); fn(); };
  return <>
    <div className="page-title"><div className="eyebrow">Source archive / attributed team-season release</div><h1>See how every<br /><em>program plays.</em></h1><p>Search the aggregate team-season fields retained from the publisher release. Use the archive for context and scouting; Silvermine ratings and forecasts remain separate model artifacts.</p></div>
    <div className="strip"><div><strong>{result?.total.toLocaleString() ?? "—"}</strong><span>Team records in view</span></div><div><strong>{result?.non_null.toLocaleString() ?? "—"}</strong><span>Records with this source field</span></div><div><strong>{fields.length || "—"}</strong><span>Retained source fields</span></div><div><strong>{seasons.length || "—"}</strong><span>Available source seasons</span></div></div>
    <div className="toolbar"><label className="control"><span>SOURCE SEASON</span><select value={season} onChange={(e) => reset(() => setSeason(e.target.value))}>{!seasons.length && <option value={season}>{season}</option>}{seasons.map((s) => <option key={s} value={s}>{s - 1}–{String(s).slice(-2)}</option>)}</select></label><label className="control"><span>SOURCE FIELD</span><select value={fieldKey} onChange={(e) => reset(() => setFieldKey(e.target.value))}>{Object.entries(grouped).map(([category, candidates]) => <optgroup key={category} label={labels[category as keyof typeof labels]}>{candidates.map((f) => <option key={`${f.category}:${f.key}`} value={`${f.category}:${f.key}`}>{f.label}</option>)}</optgroup>)}</select></label><label className="control"><span>PROGRAM</span><input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search programs" /></label><label className="control"><span>ORDER</span><select value={direction} onChange={(e) => reset(() => setDirection(e.target.value as "desc" | "asc"))}><option value="desc">Highest first</option><option value="asc">Lowest first</option></select></label></div>
    {field && <p className="note" style={{ marginBottom: 20 }}><strong>{field.label}</strong> · {field.unit}. Values and display strings come directly from the attributed publisher release.</p>}
    {error ? <p role="alert" className="status-error">{error}</p> : !result ? <p role="status" className="empty">Loading team statistics…</p> : <><div className="section-heading" style={{ marginBottom: 20 }}><p>{result.total.toLocaleString()} matching teams · page {page + 1} of {Math.max(1, Math.ceil(result.total / result.page_size))}</p><button className="button secondary" type="button" onClick={() => downloadCsv(`team-${result.field.key}-${season}.csv`, toCsv(["Program", "Source ID", "Abbreviation", result.field.label, "Raw numeric value"], result.rows.map((r) => [r.team, r.id, r.abbreviation, shown(r, result.field), r.value])))}>Download CSV ↓</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Program</th><th>Source ID</th><th>Abbr.</th><th className="numeric">{result.field.label}</th></tr></thead><tbody>{result.rows.map((r) => <tr key={r.id}><td><Link href={`/basketball/programs/${r.id}/`}>{r.team}</Link></td><td><small>{r.id}</small></td><td>{r.abbreviation || "—"}</td><td className="numeric"><strong>{shown(r, result.field)}</strong></td></tr>)}</tbody></table></div>{!result.rows.length && <p className="empty">No teams match these filters.</p>}<div className="pagination"><span>{result.total.toLocaleString()} records · publisher values remain attributable</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={(page + 1) * result.page_size >= result.total} onClick={() => setPage(page + 1)}>Next →</button></div></div></>}
    <p className="note" style={{ marginTop: 24 }}>Source: SportsDataverse attributed ESPN team-season statistics, published under CC BY 4.0. This archive includes every team observed by the release and does not imply division, eligibility or a Silvermine rating.</p>
  </>;
}
