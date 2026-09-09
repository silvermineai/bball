"use client";

import { useEffect, useMemo, useState } from "react";
import { date } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { filterRecruitingWire, isRecruitingWireArticle, latestRecruitingWirePublication, parseRecruitingWireFilters, recruitingWireFilterSearch, type RecruitingWireArticle, type RecruitingWireTopic } from "../../_lib/recruiting-wire";

const PAGE_SIZE = 12;
const labels: Record<RecruitingWireTopic, string> = { all: "All recruiting context", transfer: "Transfers and portal", prep: "Prep recruiting", draft: "NBA draft movement", eligibility: "Eligibility and availability", availability: "Injuries and availability" };

export default function RecruitingWire({ articles }: { articles: RecruitingWireArticle[] }) {
  const initial = typeof window === "undefined" ? { query: "", topic: "all" as RecruitingWireTopic, page: 0 } : parseRecruitingWireFilters(window.location.search);
  const [query, setQuery] = useState(initial.query);
  const [topic, setTopic] = useState<RecruitingWireTopic>(initial.topic);
  const [page, setPage] = useState(initial.page);
  const [copied, setCopied] = useState("");
  const [liveArticles, setLiveArticles] = useState(articles);
  const [archiveStatus, setArchiveStatus] = useState<"loading" | "live" | "fallback">("loading");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/news?sport=mens-college-basketball&limit=100", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("news archive unavailable");
        return response.json() as Promise<{ rows?: RecruitingWireArticle[] }>;
      })
      .then((payload) => {
        const rows = (payload.rows || []).filter(isRecruitingWireArticle);
        if (rows.length) {
          setLiveArticles(rows);
          setArchiveStatus("live");
        } else {
          setArchiveStatus("fallback");
        }
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") setArchiveStatus("fallback");
      });
    return () => controller.abort();
  }, [articles]);
  useEffect(() => {
    const next = recruitingWireFilterSearch({ query, topic, page });
    const url = new URL(window.location.href);
    for (const key of ["wireQ", "wireTopic", "wirePage"]) url.searchParams.delete(key);
    if (next) for (const [key, value] of new URLSearchParams(next)) url.searchParams.set(key, value);
    window.history.replaceState(window.history.state, "", url);
  }, [page, query, topic]);
  const filtered = useMemo(() => filterRecruitingWire(liveArticles, { query, topic, page }), [liveArticles, query, topic, page]);
  const latestPublication = latestRecruitingWirePublication(liveArticles);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => { if (page >= pages) setPage(Math.max(0, pages - 1)); }, [page, pages]);
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied("Wire link copied."); }
    catch { setCopied("Copy the filtered URL from your address bar."); }
  };
  return <section className="section">
    <div className="section-heading"><div><div className="eyebrow">Publisher wire / recruiting context</div><h2>Follow the national conversation.</h2></div><span className="note">{filtered.length} linked stories</span></div>
    <p className="note" style={{ marginBottom: 20 }}>These are ESPN and NCAA.com RSS headlines for context, not Silvermine-reviewed transaction records. Silvermine retains the supplied headline, summary and link, and does not fetch or rewrite linked article pages. A headline does not establish eligibility, destination or current availability; reviewed school statements appear below. Latest retained publisher publication: {latestPublication ? date(latestPublication) : "unavailable"}. {archiveStatus === "live" ? "D1 archive connected." : archiveStatus === "fallback" ? "Showing the bundled release while the D1 archive is unavailable." : "Checking the D1 archive…"}</p>
    <div className="toolbar">
      <label className="control"><span>SEARCH THE WIRE</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Player, program or headline" /></label>
      <label className="control"><span>TOPIC</span><select value={topic} onChange={(event) => { setTopic(event.target.value as RecruitingWireTopic); setPage(0); }}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="button secondary" type="button" onClick={share}>Copy wire link</button>
      <button className="button secondary" type="button" onClick={() => downloadCsv("basketball-recruiting-wire.csv", toCsv(["Published", "Headline", "Description", "Categories", "Publisher URL"], filtered.map((article) => [article.published, article.headline, article.description, article.categories.join(" | "), article.link])))}>Download CSV ↓</button>
    </div>
    {copied && <p role="status">{copied}</p>}
    <div className="article-grid">{visible.map((article) => <article className="article-card" key={article.id}><div className="eyebrow">{date(article.published)} · {article.publisher || "ESPN"} RSS</div><h2>{article.headline}</h2><p>{article.description}</p><a href={article.link} target="_blank" rel="noreferrer">Read publisher article ↗</a></article>)}</div>
    {!visible.length && <p className="empty">No linked stories match this search.</p>}
    <div className="pagination"><span>{filtered.length} matching stories · page {page + 1} of {pages}</span><div><button className="button secondary" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next →</button></div></div>
  </section>;
}
