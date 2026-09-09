"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { combineSearchResults, searchPrograms, type SearchProgram, type SearchResult } from "../_lib/global-search";

type PlayerRow = { id?: string; name?: string | null; team?: string | null; position?: string | null };
type PlayerResponse = { rows?: PlayerRow[] };
type RatingResponse = { board?: Array<{ id?: string | number; name?: string }> };

let programsPromise: Promise<SearchProgram[]> | null = null;
const loadPrograms = () => {
  programsPromise ??= fetch("/data/ratings.json")
    .then((response) => {
      if (!response.ok) throw new Error("program catalog unavailable");
      return response.json() as Promise<RatingResponse>;
    })
    .then((payload) => (payload.board || [])
      .filter((row): row is { id: string | number; name: string } => row.id != null && !!row.name)
      .map((row) => ({ id: String(row.id), name: row.name })));
  return programsPromise;
};

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      Promise.all([
        fetch(`/api/basketball/research/player-core?season=2026&q=${encodeURIComponent(needle)}&page=0`, { signal: controller.signal })
          .then((response) => response.ok ? response.json() as Promise<PlayerResponse> : { rows: [] }),
        loadPrograms(),
      ])
        .then(([players, programs]) => {
          const playerResults: SearchResult[] = (players.rows || [])
            .filter((row): row is PlayerRow & { id: string; name: string } => !!row.id && !!row.name)
            .slice(0, 5)
            .map((row) => ({
              id: row.id,
              name: row.name,
              type: "player",
              detail: [row.team, row.position].filter(Boolean).join(" · ") || "Source player",
              href: `/basketball/player/?id=${encodeURIComponent(row.id)}&season=2026`,
            }));
          setResults(combineSearchResults(playerResults, searchPrograms(programs, needle), 8));
          setOpen(true);
        })
        .catch((reason: unknown) => {
          if ((reason as { name?: string })?.name !== "AbortError") setError("Search is temporarily unavailable.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);

  return (
    <div className="global-search" ref={root}>
      <label>
        <span className="sr-only">Search basketball players and programs</span>
        <input
          type="search"
          value={query}
          maxLength={120}
          placeholder="Search players or programs"
          aria-label="Search basketball players and programs"
          aria-expanded={open}
          onFocus={() => { if (results.length) setOpen(true); }}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        />
      </label>
      {open && query.trim().length >= 2 && (
        <div className="global-search-results" role="listbox" aria-label="Search results">
          {loading && <span className="global-search-status">Searching the source catalog…</span>}
          {!loading && error && <span className="global-search-status">{error}</span>}
          {!loading && !error && results.map((result) => (
            <Link href={result.href} role="option" className="global-search-result" key={`${result.type}-${result.id}`} onClick={() => setOpen(false)}>
              <span><strong>{result.name}</strong><small>{result.detail}</small></span>
              <em>{result.type === "player" ? "Player" : "Program"}</em>
            </Link>
          ))}
          {!loading && !error && !results.length && <span className="global-search-status">No source records found.</span>}
        </div>
      )}
    </div>
  );
}
