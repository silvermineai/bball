"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { lowerDivisionPlayerHref } from "../_lib/division-archive-links";
import {
  divisionMetricCoverage,
  divisionMetricLabel,
  divisionRankingMetricGuide,
  divisionRankingMetrics,
  rankDivisionPlayers,
  type DivisionPlayer,
  type DivisionRankingMetric,
} from "../_lib/division-player-rankings";
import {
  divisionPlayerDetailGroups,
  retainedPlayerValue,
  type DivisionPlayerWithEvidence,
} from "../_lib/division-player-detail";

type Publication = { season: number; generated_at: string; players: DivisionPlayerWithEvidence[] };
type LiveRankingRow = {
  player_id: string | number;
  division: string | number;
  name: string;
  team_name?: string | null;
  publisher_rank?: number | null;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};
type LiveRankingResponse = {
  season?: number;
  total?: number;
  pages?: number;
  rows?: LiveRankingRow[];
  provenance?: { kind?: string; dataset?: string; note?: string };
};

// The live source-native endpoint covers these measures. The remaining
// retained D2/D3 fields stay available through the static archive until a
// matching public endpoint exists; no field is synthesized in the fallback.
const liveMetrics = new Set<string>([
  "ppg", "rpg", "apg", "spg", "bpg", "fg_pct", "three_pct", "ft_pct",
  "threes_pg", "mpg", "ast_to", "dbl_dbl", "pts", "reb", "ast", "stl",
  "blk", "tov", "fgm", "fga", "three_fgm", "three_fga", "ftm", "fta",
  "orb", "drb", "pf", "o_poss", "tpm", "tpa", "mins",
]);

export function normalizeLiveRow(row: LiveRankingRow, metric: DivisionRankingMetric): DivisionPlayerWithEvidence {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const sourceRank = typeof row.publisher_rank === "number" ? row.publisher_rank : null;
  const selectedValue = row[metric];
  return {
    ...payload,
    player_id: String(row.player_id),
    division: String(row.division),
    name: row.name || String(payload.name || row.player_id),
    team_name: row.team_name ?? (typeof payload.team_name === "string" ? payload.team_name : null),
    [metric]: typeof selectedValue === "number" ? selectedValue : null,
    [`${metric}_rank`]: sourceRank,
    source_stats: payload.source_stats as DivisionPlayerWithEvidence["source_stats"],
  } as DivisionPlayerWithEvidence;
}

const value = (raw: number | null | undefined, digits = 1) =>
  typeof raw === "number" && Number.isFinite(raw) ? raw.toFixed(digits) : "—";

const detailValue = (player: DivisionPlayer, key: string, kind: "count" | "minutes" | "rate") => {
  const raw = retainedPlayerValue(player, key);
  if (raw == null) return "—";
  return value(raw, kind === "rate" ? 2 : kind === "minutes" ? 1 : 0);
};

const captured = (raw: string) => {
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? "capture date unavailable"
    : date.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function DivisionPlayerRankings({ division }: { division: "2" | "3" }) {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [liveRows, setLiveRows] = useState<DivisionPlayerWithEvidence[] | null>(null);
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  const [liveStatus, setLiveStatus] = useState<"checking" | "ready" | "unavailable" | "static">("checking");
  const [query, setQuery] = useState("");
  const [metric, setMetric] = useState<DivisionRankingMetric>("ppg");
  const [minGames, setMinGames] = useState("5");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/basketball/ncaa-individual.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value: Publication | null) => {
        if (!controller.signal.aborted) setPublication(value);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) setPublication(null);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!liveMetrics.has(metric)) {
      setLiveRows(null);
      setLiveTotal(null);
      setLiveStatus("static");
      return;
    }
    const controller = new AbortController();
    setLiveStatus("checking");
    const params = new URLSearchParams({ division, stat: metric, min_games: minGames, page: "0" });
    if (query.trim()) params.set("q", query.trim());
    const load = async () => {
      const firstResponse = await fetch(`/api/basketball/research/ncaa-leaders?${params.toString()}`, { signal: controller.signal });
      if (!firstResponse.ok) throw new Error("Live division rankings unavailable");
      const first = await firstResponse.json() as LiveRankingResponse;
      const pageCount = Math.min(3, Math.max(1, Number(first.pages) || 1));
      const pages = [first, ...await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => {
        const pageParams = new URLSearchParams(params);
        pageParams.set("page", String(index + 1));
        return fetch(`/api/basketball/research/ncaa-leaders?${pageParams.toString()}`, { signal: controller.signal })
          .then((response) => response.ok ? response.json() as Promise<LiveRankingResponse> : Promise.reject(new Error("Live division rankings unavailable")));
      }))];
      const rows = pages.flatMap((page) => (page.rows || []).map((row) => normalizeLiveRow(row, metric)));
      if (controller.signal.aborted) return;
      setLiveRows(rows);
      setLiveTotal(Number(first.total) || rows.length);
      setLiveStatus("ready");
    };
    load().catch((reason: unknown) => {
      if ((reason as { name?: string })?.name !== "AbortError" && !controller.signal.aborted) {
        setLiveRows(null);
        setLiveTotal(null);
        setLiveStatus("unavailable");
      }
    });
    return () => controller.abort();
  }, [division, metric, minGames, query]);

  const result = useMemo(() => rankDivisionPlayers(publication?.players || [], {
    division,
    metric,
    query,
    minGames: Number(minGames),
    limit: 100,
  }), [division, metric, minGames, publication, query]);
  const activeResult = useMemo(() => liveRows
    ? rankDivisionPlayers(liveRows, { division, metric, query: "", minGames: 0, limit: 100 })
    : result, [division, liveRows, metric, result]);
  const coverage = useMemo(() => divisionMetricCoverage(publication?.players || [], {
    division,
    metric,
    minGames: Number(minGames),
    query,
  }), [division, metric, minGames, publication, query]);

  return <section className="field-card division-player-rankings" aria-labelledby="division-ranking-title">
    <div className="eyebrow">MEN&apos;S BASKETBALL · D{division} PLAYER RANKINGS</div>
    <h2 id="division-ranking-title">Rank the retained production</h2>
    <p className="muted">Rank one recorded source field within Division {division}. Source publisher ranks and Silvermine’s filtered rank stay separate; missing fields stay unavailable.</p>
    {!publication ? <p className="muted">Loading division ranking archive…</p> : <>
      <div className="division-player-controls">
        <label htmlFor="division-ranking-search">Search player, team, or conference</label>
        <input id="division-ranking-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, program, or conference" />
        <label htmlFor="division-ranking-metric">Rank by</label>
        <select id="division-ranking-metric" value={metric} onChange={(event) => setMetric(event.target.value as DivisionRankingMetric)}>
          {divisionRankingMetrics.map(([key, short]) => <option key={key} value={key}>{short} · {divisionMetricLabel(key)}</option>)}
        </select>
        <label htmlFor="division-ranking-min-games">Minimum games</label>
        <select id="division-ranking-min-games" value={minGames} onChange={(event) => setMinGames(event.target.value)}>
          {[0, 5, 10, 15, 20].map((games) => <option key={games} value={games}>{games ? `${games} games` : "Any recorded games"}</option>)}
        </select>
      </div>
      <details className="ranking-reading-guide">
        <summary>How to read this ranking</summary>
        <div className="ranking-reading-guide-body">
          <p><strong>{divisionMetricLabel(metric)}:</strong> {divisionRankingMetricGuide(metric).definition}</p>
          <p><strong>Denominator:</strong> {divisionRankingMetricGuide(metric).denominator}</p>
          <p><strong>Use it carefully:</strong> {divisionRankingMetricGuide(metric).interpretation}</p>
          <p><strong>Rank method:</strong> qualifying rows are sorted by the selected recorded value within Division {division}; ties share a competition rank (1, 1, 3). Rows without a finite selected value stay out of the ranking, while the coverage line below the controls keeps that missingness visible.</p>
        </div>
      </details>
      <p className="note">{liveStatus === "ready" ? `${(liveTotal ?? activeResult.total).toLocaleString()} live qualifying players` : `${activeResult.total.toLocaleString()} qualifying players`} · showing {activeResult.rows.length} · {divisionMetricLabel(metric)} · season {publication.season} · {liveStatus === "ready" ? "current source API" : `captured ${captured(publication.generated_at)}`}{liveStatus === "unavailable" ? " · live refresh unavailable; using the retained archive" : ""}.</p>
      <p className="note" role="status">{liveStatus === "ready" ? "Live publisher rows are filtered by exact division, selected metric, and minimum games. Missing source fields remain absent; the table falls back to the retained archive only when the live request is unavailable." : `Metric coverage: ${coverage.valueRows.toLocaleString()} of ${coverage.gameQualifiedRows.toLocaleString()} search and game-qualified ${division === "2" ? "Division II" : "Division III"} rows have a recorded ${divisionMetricLabel(metric).toLowerCase()} value${coverage.missingValueRows ? `; ${coverage.missingValueRows.toLocaleString()} remain unavailable` : "."} The ${coverage.divisionRows.toLocaleString()}-row division denominator is retained for context.`}</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Team</th><th>Conf.</th><th>Class</th><th className="numeric">GP</th><th className="numeric">{divisionMetricLabel(metric)}</th><th className="numeric">Source rank</th><th>Recorded stats</th></tr></thead><tbody>{activeResult.rows.map((player) => <tr key={`${division}-${player.player_id}`}><td className="numeric"><strong>#{player.rank}</strong></td><th scope="row"><Link href={lowerDivisionPlayerHref(division, player.player_id)}>{player.name} →</Link><small>Player ID {player.player_id}</small></th><td>{player.team_name || "—"}</td><td>{player.conference || "—"}</td><td>{player.class_year || "—"}</td><td className="numeric">{value(player.games, 0)}</td><td className="numeric"><strong>{value(player.value)}</strong></td><td className="numeric">{player.source_rank == null ? "—" : `#${player.source_rank}`}</td><td><details className="ranking-recorded-details"><summary>Open retained fields</summary><p className="note">Source values retained for this player row. A dash means the release did not contain a finite numeric value; no value is inferred.</p>{divisionPlayerDetailGroups.map((group) => <div key={group.label}><strong>{group.label}</strong><div className="note">{group.fields.map(([key, label, kind]) => <span key={key} style={{ display: "inline-block", marginRight: 12 }}>{label}: <strong>{detailValue(player, key, kind)}</strong></span>)}</div></div>)}{player.source_stats && Object.keys(player.source_stats).length ? <p className="note">Publisher evidence: {Object.entries(player.source_stats).map(([key, evidence]) => `${key}${evidence.rank == null ? "" : ` (#${evidence.rank})`}${evidence.value == null ? "" : ` = ${evidence.value}`}`).join(" · ")}</p> : null}</details></td></tr>)}</tbody></table></div>
      {!activeResult.rows.length ? <p className="empty">No retained players match this ranking filter.</p> : null}
      <p className="muted">These are final-season descriptive records from the retained national individual archive. They do not infer eligibility, role, availability, future performance, or a composite player grade.</p>
    </>}
  </section>;
}
