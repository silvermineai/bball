"use client";

import { useEffect, useState } from "react";

type PublisherMention = {
  id: string;
  publisher: string;
  headline: string;
  description?: string;
  published: string;
  link: string;
  division?: string;
};

function searchName(value: string) {
  const withoutNickname = value.replace(/\s*\([^)]*\)/g, "").trim();
  const words = withoutNickname.split(/\s+/).filter(Boolean);
  return words.length > 2 ? words.slice(0, 2).join(" ") : withoutNickname;
}

export default function LiveGamePublisherWire({
  away,
  home,
}: {
  away: string;
  home: string;
}) {
  const [mentions, setMentions] = useState<PublisherMention[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "live" | "none" | "unavailable">("loading");

  useEffect(() => {
    const controller = new AbortController();
    const queries = [away, home]
      .map(searchName)
      .filter((value, index, values) => value && values.indexOf(value) === index);
    setMentions([]);
    setQuery(queries[0] || "");
    setStatus(queries.length ? "loading" : "none");
    const load = async () => {
      for (const search of queries) {
        const response = await fetch(`/api/basketball/research/news?sport=mens-college-basketball&q=${encodeURIComponent(search)}&limit=4&game_notebook=1`, { signal: controller.signal });
        if (!response.ok) continue;
        const value = await response.json() as { rows?: PublisherMention[] };
        if (Array.isArray(value.rows) && value.rows.length) {
          if (!controller.signal.aborted) {
            setMentions(value.rows.slice(0, 4));
            setQuery(search);
            setStatus("live");
          }
          return;
        }
      }
      if (!controller.signal.aborted) setStatus("none");
    };
    load().catch(() => {
      if (!controller.signal.aborted) setStatus("unavailable");
    });
    return () => controller.abort();
  }, [away, home]);

  return (
    <section className="section paper-panel" aria-labelledby="game-publisher-wire">
      <div className="section-heading" style={{ marginBottom: 12 }}>
        <div><div className="eyebrow">Publisher wire / literal team search</div><h2 id="game-publisher-wire">Keep the reporting context close.</h2></div>
        <span className="note">ESPN + NCAA.com RSS</span>
      </div>
      <p className="note">A literal search of the two program names surfaces recent permitted headlines for the notebook. These mentions are reporting context; they are not availability, roster, transaction or forecast inputs.</p>
      {status === "loading" && <p className="empty" role="status">Checking the permitted publisher wire…</p>}
      {status === "unavailable" && <p className="empty" role="status">The publisher wire is temporarily unavailable. Search the full news archive instead.</p>}
      {status === "none" && <p className="empty" role="status">No retained headline matched either program.</p>}
      {mentions.length > 0 && <>
        <p className="note" role="status">Showing {mentions.length} retained headline{mentions.length === 1 ? "" : "s"} for “{query}”.</p>
        <div className="article-grid">
          {mentions.map((mention) => <article className="article-card" key={mention.id}>
            <div className="eyebrow">{mention.publisher}{mention.division ? ` · ${mention.division}` : ""} · {mention.published ? new Date(mention.published).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "date unavailable"}</div>
            <h3>{mention.headline}</h3>
            {mention.description && <p>{mention.description}</p>}
            <a href={mention.link} target="_blank" rel="noreferrer">Read publisher source ↗</a>
          </article>)}
        </div>
      </>}
      <p style={{ marginTop: 12 }}><a href={`/basketball/news/?q=${encodeURIComponent(query || away)}`}>Search the complete publisher archive →</a></p>
    </section>
  );
}
