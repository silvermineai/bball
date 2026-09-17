"use client";

import { useEffect, useMemo, useState } from "react";
import { date } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";
import { fetchJson } from "../../_lib/fetch-json";

export type PublisherArticle = {
  id: string;
  headline: string;
  description: string;
  published: string;
  link?: string;
  categories: string[];
  publisher?: string;
  sport?: string;
  division?: "D-I" | "D-II" | "D-III";
};

export type FeedError = {
  error: string;
  fallback_articles: number;
};

type DivisionFilter = "all" | "D-I" | "D-II" | "D-III";

const PAGE_SIZE = 12;
const publicText = (value: string) => value
  .replace(/https?:\/\/[^\s"'<>]+/gi, "archived media")
  .replace(/\b(?:ESPN|NCAA(?:\.com)?|SportsDataverse|CBBD)\b/gi, "the reporting desk");

function parseInitial() {
  if (typeof window === "undefined") return { query: "", division: "all" as DivisionFilter, page: 0 };
  const params = new URLSearchParams(window.location.search);
  const page = Number(params.get("page"));
  return {
    query: params.get("q") || "",
    division: (params.get("division") as DivisionFilter) || "all",
    page: Number.isInteger(page) && page >= 0 ? page : 0,
  };
}

export default function NewsArchive({
  generatedAt,
  articles,
  groupCount = 0,
  feedErrorCount = 0,
}: {
  generatedAt?: string;
  articles: PublisherArticle[];
  groupCount?: number;
  feedErrorCount?: number;
}) {
  const initial = parseInitial();
  const [query, setQuery] = useState(initial.query);
  const [division, setDivision] = useState<DivisionFilter>(initial.division);
  const [page, setPage] = useState(initial.page);
  const [copied, setCopied] = useState("");
  const [liveArticles, setLiveArticles] = useState(articles);
  const [archiveStatus, setArchiveStatus] = useState<"loading" | "live" | "fallback">("loading");
  useEffect(() => {
    const controller = new AbortController();
    fetchJson<{ rows?: PublisherArticle[] }>("/api/basketball/research/news?sport=mens-college-basketball&limit=100", { signal: controller.signal })
      .then((payload) => {
        const rows = (payload.rows || []).filter((article) => article.sport === "mens-college-basketball" || !article.sport);
        if (rows.length) {
          setLiveArticles(rows);
          setArchiveStatus("live");
        } else {
          setArchiveStatus("fallback");
        }
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") setArchiveStatus("fallback");
      });
    return () => controller.abort();
  }, [articles]);
  const divisions = useMemo(
    () => ["D-I", "D-II", "D-III"].filter((value) => liveArticles.some((article) => article.division === value)) as Array<Exclude<DivisionFilter, "all">>,
    [liveArticles],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return liveArticles.filter((article) => {
      if (division !== "all" && article.division !== division) return false;
      if (!needle) return true;
      return `${article.headline} ${article.description} ${article.categories.join(" ")}`.toLowerCase().includes(needle);
    });
  }, [division, liveArticles, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => {
    if (page >= pages) setPage(Math.max(0, pages - 1));
  }, [page, pages]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (division !== "all") params.set("division", division);
    if (page) params.set("page", String(page));
    const value = params.toString();
    window.history.replaceState(window.history.state, "", value ? `${window.location.pathname}?${value}` : window.location.pathname);
  }, [division, page, query]);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("News archive link copied.");
    } catch {
      setCopied("Copy the filtered URL from your address bar.");
    }
  };
  const exportRows = () => downloadCsv(
    "basketball-publisher-news.csv",
    toCsv(
      ["Published", "Division", "Headline", "Description", "Categories"],
      filtered.map((article) => [article.published, article.division || "—", article.headline, article.description, article.categories.join(" | ")]),
    ),
  );
  return (
    <section className="section">
      <div className="strip">
        <div><strong>{liveArticles.length.toLocaleString()}</strong><span>Retained headlines</span></div>
        <div><strong>{groupCount.toLocaleString()}</strong><span>Archive groups</span></div>
        <div><strong>{filtered.length.toLocaleString()}</strong><span>Matches in view</span></div>
        <div><strong>{generatedAt ? date(generatedAt) : "—"}</strong><span>Release clock</span></div>
      </div>
      <p className="note">
        {archiveStatus === "live"
          ? "Cloudflare D1 archive connected; showing the latest retained release."
          : archiveStatus === "fallback"
            ? "Cloudflare D1 archive unavailable; showing the bundled release."
            : "Checking the Cloudflare D1 archive…"}
        {feedErrorCount > 0 && <> {feedErrorCount} archive group{feedErrorCount === 1 ? "" : "s"} unavailable; prior headlines remain retained.</>}
      </p>
      <div className="toolbar">
        <label className="control"><span>SEARCH THE ARCHIVE</span><input type="search" maxLength={120} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Player, program or headline" /></label>
        <label className="control"><span>DIVISION</span><select value={division} onChange={(event) => { setDivision(event.target.value as DivisionFilter); setPage(0); }}><option value="all">All divisions</option>{divisions.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <button className="button secondary" type="button" onClick={share}>Copy archive link</button>
        <button className="button secondary" type="button" onClick={exportRows}>Download CSV ↓</button>
      </div>
      {copied && <p className="note" role="status">{copied}</p>}
      <div className="article-grid">
        {visible.map((article) => (
          <article className="article-card" key={article.id}>
            <div className="eyebrow">{date(article.published)}{article.division ? ` · ${article.division}` : ""} · Retained report</div>
            <h2>{publicText(article.headline)}</h2>
            <p>{publicText(article.description)}</p>
          </article>
        ))}
      </div>
      {!visible.length && <p className="empty">No retained headlines match this search.</p>}
      <div className="pagination"><span>{filtered.length.toLocaleString()} matching stories · page {page + 1} of {pages}</span><div><button className="button secondary" type="button" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next →</button></div></div>
      <p className="note" style={{ marginTop: 20 }}>Silvermine stores the supplied headline, summary and publication time in this reporting archive. This context stays separate from statistics, forecasts, recruiting evidence and eligibility decisions.</p>
    </section>
  );
}
