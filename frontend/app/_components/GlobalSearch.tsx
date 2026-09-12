"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { combineSearchResults, searchPrograms, searchRecruitingPeople, searchRosterPeople, type SearchProgram, type SearchResult, type SearchRecruitingPerson, type SearchRosterPerson } from "../_lib/global-search";

type PlayerRow = { id?: string; name?: string | null; team?: string | null; position?: string | null };
type PlayerResponse = { rows?: PlayerRow[] };
type RatingResponse = { board?: Array<{ id?: string | number; name?: string }> };
type LegacyRow = { id?: string; name?: string | null; type?: "player" | "team"; source?: "ncaa" | "football"; latest_season?: number };
type LegacyResponse = { results?: LegacyRow[] };
type RecruitingResponse = { people?: SearchRecruitingPerson[] };
type ProspectResponse = { rows?: Array<{ athlete_id?: string; name?: string; position?: string | null; committed_team_name?: string | null }> };
type RosterResponse = { players?: SearchRosterPerson[] };

let programsPromise: Promise<SearchProgram[]> | null = null;
let recruitingPromise: Promise<SearchRecruitingPerson[]> | null = null;
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
const loadRecruiting = () => {
  recruitingPromise ??= fetch("/api/basketball/research/recruiting?season=2027")
    .then((response) => response.ok ? response.json() as Promise<RecruitingResponse> : { people: [] })
    .then((payload) => payload.people || [])
    .catch(() => []);
  return recruitingPromise;
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
        loadRecruiting(),
        Promise.all([2026, 2027, 2028].map((season) =>
          fetch(`/api/basketball/research/recruiting-rankings?season=${season}&q=${encodeURIComponent(needle)}&page=0`, { signal: controller.signal })
            .then((response) => response.ok ? response.json() as Promise<ProspectResponse> : { rows: [] })
            .then((payload) => (payload.rows || []).map((row) => ({ ...row, season })))
            .catch((reason: unknown) => {
              if ((reason as { name?: string })?.name === "AbortError") throw reason;
              return [];
            })
        )).then((groups) => groups.flat()),
        fetch(`/api/basketball/research/rosters?season=2027&q=${encodeURIComponent(needle)}&limit=5`, { signal: controller.signal })
          .then((response) => response.ok ? response.json() as Promise<RosterResponse> : { players: [] })
          .then((payload) => payload.players || []),
        fetch(`/api/search?q=${encodeURIComponent(needle)}&sport=s_mbb`, { signal: controller.signal })
          .then((response) => response.ok ? response.json() as Promise<LegacyResponse> : { results: [] }),
        fetch(`/api/search?q=${encodeURIComponent(needle)}&sport=s_fbl`, { signal: controller.signal })
          .then((response) => response.ok ? response.json() as Promise<LegacyResponse> : { results: [] }),
      ])
        .then(([players, programs, recruitingPeople, prospects, rosterPeople, basketballArchive, football]) => {
          const playerResults: SearchResult[] = (players.rows || [])
            .filter((row): row is PlayerRow & { id: string; name: string } => !!row.id && !!row.name)
            .slice(0, 5)
            .map((row) => ({
              id: row.id,
              name: row.name,
              type: "player",
              sport: "basketball",
              detail: [row.team, row.position, "Basketball"].filter(Boolean).join(" · ") || "Basketball source player",
              href: `/basketball/player/?id=${encodeURIComponent(row.id)}&season=2026`,
            }));
          const ncaaResults: SearchResult[] = (basketballArchive.results || [])
            .filter((row): row is LegacyRow & { id: string; name: string; type: "player"; source: "ncaa" } => !!row.id && !!row.name && row.type === "player" && row.source === "ncaa")
            .slice(0, 3)
            .map((row) => ({
              id: `ncaa-${row.id}`,
              name: row.name,
              type: "player",
              sport: "basketball",
              detail: `NCAA source player · ${row.latest_season ? `${row.latest_season - 1}–${String(row.latest_season).slice(-2)}` : "historical archive"}`,
              href: `/basketball/ncaa-player/?id=${encodeURIComponent(row.id)}${row.latest_season ? `&season=${encodeURIComponent(row.latest_season)}` : ""}`,
            }));
          const legacyBasketballResults: SearchResult[] = (basketballArchive.results || [])
            .filter((row): row is LegacyRow & { id: string; name: string; type: "player" } => !!row.id && !!row.name && row.type === "player" && row.source !== "ncaa")
            .slice(0, 3)
            .map((row) => ({
              id: `legacy-${row.id}`,
              name: row.name,
              type: "player",
              sport: "basketball",
              detail: "Basketball source player",
              href: `/basketball/player/?id=${encodeURIComponent(row.id)}`,
            }));
          const recruitingResults = searchRecruitingPeople(recruitingPeople, needle, 3);
          const prospectResults: SearchResult[] = prospects
            .filter((row): row is { athlete_id: string; name: string; position?: string | null; committed_team_name?: string | null; season: number } => !!row.athlete_id && !!row.name && typeof row.season === "number")
            .slice(0, 3)
            .map((row) => ({
              id: `espn-recruit-${row.season}-${row.athlete_id}`,
              name: row.name,
              type: "player",
              sport: "basketball",
              detail: `ESPN ${row.season} prospect${row.committed_team_name ? ` · ${row.committed_team_name}` : row.position ? ` · ${row.position}` : ""}`,
              href: `/basketball/recruiting/prospect/?season=${row.season}&id=${row.athlete_id}`,
            }));
          const rosterResults = searchRosterPeople(rosterPeople, needle, 3);
          const footballResults: SearchResult[] = (football.results || [])
            .filter((row): row is LegacyRow & { id: string; name: string; type: "player" | "team" } => !!row.id && !!row.name && !!row.type)
            .slice(0, 3)
            .map((row) => ({
              id: row.id,
              name: row.name,
              type: row.type === "team" ? "program" : "player",
              sport: "football",
              detail: row.type === "team" ? "Football program" : "Football player",
              href: row.type === "team"
                ? `/football/matchups/?team=${encodeURIComponent(row.name)}`
                : `/football/player/?id=${encodeURIComponent(row.id)}`,
            }));
          setResults(combineSearchResults([...playerResults.slice(0, 3), ...legacyBasketballResults, ...ncaaResults, ...recruitingResults, ...prospectResults, ...rosterResults, ...footballResults], searchPrograms(programs, needle, 4), 8, needle));
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
        <span className="sr-only">Search college basketball and football players and programs</span>
        <input
          name="global-search"
          autoComplete="off"
          type="search"
          value={query}
          maxLength={120}
          placeholder="Search players or programs…"
          aria-label="Search college basketball and football players and programs"
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
              <em>{result.sport ? `${result.sport} · ` : ""}{result.type === "player" ? "Player" : "Program"}</em>
            </Link>
          ))}
          {!loading && !error && !results.length && <span className="global-search-status">No source records found.</span>}
        </div>
      )}
    </div>
  );
}
