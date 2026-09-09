"use client";

import { useEffect, useMemo, useState } from "react";
import { date } from "../../_lib/format";
import { downloadCsv, toCsv } from "../../_lib/csv";

export type PublisherArticle = {
  id: string;
  headline: string;
  description: string;
  published: string;
  link: string;
  categories: string[];
  publisher: string;
  sport?: string;
};

const PAGE_SIZE = 12;

function parseInitial() {
  if (typeof window === "undefined") return { query: "", publisher: "all", page: 0 };
  const params = new URLSearchParams(window.location.search);
  const page = Number(params.get("page"));
  return {
    query: params.get("q") || "",
    publisher: params.get("publisher") || "all",
    page: Number.isInteger(page) && page >= 0 ? page : 0,
  };
}

export default function NewsArchive({
  generatedAt,
  articles,
  feeds,
  termsUrl,
}: {
  generatedAt?: string;
  articles: PublisherArticle[];
  feeds: Array<{ publisher: string; url: string }>;
  termsUrl?: string;
}) {
  const initial = parseInitial();
  const [query, setQuery] = useState(initial.query);
  const [publisher, setPublisher] = useState(initial.publisher);
  const [page, setPage] = useState(initial.page);
  const [copied, setCopied] = useState("");
  const [liveArticles, setLiveArticles] = useState(articles);
  const [archiveStatus, setArchiveStatus] = useState<"loading" | "live" | "fallback">("loading");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/basketball/research/news?sport=mens-college-basketball&limit=100", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("news archive unavailable");
        return response.json() as Promise<{ rows?: PublisherArticle[] }>;
      })
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
  const publishers = useMemo(
    () => [...new Set(liveArticles.map((article) => article.publisher).filter(Boolean))].sort(),
    [liveArticles],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return liveArticles.filter((article) => {
      if (publisher !== "all" && article.publisher !== publisher) return false;
      if (!needle) return true;
      return `${article.headline} ${article.description} ${article.categories.join(" ")}`.toLowerCase().includes(needle);
    });
  }, [liveArticles, publisher, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => {
    if (page >= pages) setPage(Math.max(0, pages - 1));
  }, [page, pages]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (publisher !== "all") params.set("publisher", publisher);
    if (page) params.set("page", String(page));
    const value = params.toString();
    window.history.replaceState(window.history.state, "", value ? `${window.location.pathname}?${value}` : window.location.pathname);
  }, [page, publisher, query]);
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
      ["Published", "Publisher", "Headline", "Description", "Categories", "Source URL"],
      filtered.map((article) => [article.published, article.publisher, article.headline, article.description, article.categories.join(" | "), article.link]),
    ),
  );
  return (
    <section className="section">
      <div className="strip">
        <div><strong>{liveArticles.length.toLocaleString()}</strong><span>Retained headlines</span></div>
        <div><strong>{publishers.length}</strong><span>Publishers</span></div>
        <div><strong>{filtered.length.toLocaleString()}</strong><span>Matches in view</span></div>
        <div><strong>{generatedAt ? date(generatedAt) : "—"}</strong><span>Release clock</span></div>
      </div>
      <p className="note">{archiveStatus === "live" ? "Cloudflare D1 archive connected; showing the latest retained release." : archiveStatus === "fallback" ? "Cloudflare D1 archive unavailable; showing the bundled release." : "Checking the Cloudflare D1 archive…"}</p>
      <div className="toolbar">
        <label className="control"><span>SEARCH THE ARCHIVE</span><input type="search" maxLength={120} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Player, program or headline" /></label>
        <label className="control"><span>PUBLISHER</span><select value={publisher} onChange={(event) => { setPublisher(event.target.value); setPage(0); }}><option value="all">All publishers</option>{publishers.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <button className="button secondary" type="button" onClick={share}>Copy archive link</button>
        <button className="button secondary" type="button" onClick={exportRows}>Download CSV ↓</button>
      </div>
      {copied && <p className="note" role="status">{copied}</p>}
      <div className="article-grid">
        {visible.map((article) => (
          <article className="article-card" key={article.id}>
            <div className="eyebrow">{date(article.published)} · {article.publisher} RSS</div>
            <h2>{article.headline}</h2>
            <p>{article.description}</p>
            <a href={article.link} target="_blank" rel="noreferrer">Read publisher source ↗</a>
          </article>
        ))}
      </div>
      {!visible.length && <p className="empty">No retained headlines match this search.</p>}
      <div className="pagination"><span>{filtered.length.toLocaleString()} matching stories · page {page + 1} of {pages}</span><div><button className="button secondary" type="button" disabled={!page} onClick={() => setPage(page - 1)}>← Previous</button><button className="button secondary" type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next →</button></div></div>
      <p className="note" style={{ marginTop: 20 }}>Silvermine stores the supplied headline, summary, publication time and source URL from permitted publisher RSS feeds. Linked article pages are not fetched or rewritten. This archive is reporting context, not a transaction ledger, eligibility database, injury feed or forecast input. {termsUrl ? <a href={termsUrl} target="_blank" rel="noreferrer">Read publisher RSS terms ↗</a> : null}</p>
      <div className="button-row" style={{ marginTop: 12 }}>{feeds.map((feed) => <a className="button secondary" href={feed.url} target="_blank" rel="noreferrer" key={feed.url}>Open {feed.publisher} feed ↗</a>)}</div>
    </section>
  );
}
