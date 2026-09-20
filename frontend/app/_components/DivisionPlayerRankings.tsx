"use client";

import { useEffect, useMemo, useState } from "react";
import {
  divisionMetricLabel,
  divisionRankingMetrics,
  rankDivisionPlayers,
  type DivisionPlayer,
  type DivisionRankingMetric,
} from "../_lib/division-player-rankings";

type Publication = { season: number; generated_at: string; players: DivisionPlayer[] };

const value = (raw: number | null | undefined, digits = 1) =>
  typeof raw === "number" && Number.isFinite(raw) ? raw.toFixed(digits) : "—";

const captured = (raw: string) => {
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? "capture date unavailable"
    : date.toLocaleDateString("en-US", { timeZone: "UTC" });
};

export default function DivisionPlayerRankings({ division }: { division: "2" | "3" }) {
  const [publication, setPublication] = useState<Publication | null>(null);
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

  const result = useMemo(() => rankDivisionPlayers(publication?.players || [], {
    division,
    metric,
    query,
    minGames: Number(minGames),
    limit: 100,
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
      <p className="note">{result.total.toLocaleString()} qualifying players · showing {result.rows.length} · {divisionMetricLabel(metric)} · season {publication.season} · captured {captured(publication.generated_at)}.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Rank</th><th>Player</th><th>Team</th><th>Conf.</th><th>Class</th><th className="numeric">GP</th><th className="numeric">{divisionMetricLabel(metric)}</th><th className="numeric">Source rank</th></tr></thead><tbody>{result.rows.map((player) => <tr key={`${division}-${player.player_id}`}><td className="numeric"><strong>#{player.rank}</strong></td><th scope="row">{player.name}<small>Player ID {player.player_id}</small></th><td>{player.team_name || "—"}</td><td>{player.conference || "—"}</td><td>{player.class_year || "—"}</td><td className="numeric">{value(player.games, 0)}</td><td className="numeric"><strong>{value(player.value)}</strong></td><td className="numeric">{player.source_rank == null ? "—" : `#${player.source_rank}`}</td></tr>)}</tbody></table></div>
      {!result.rows.length ? <p className="empty">No retained players match this ranking filter.</p> : null}
      <p className="muted">These are final-season descriptive records from the retained NCAA individual archive. They do not infer eligibility, role, availability, future performance, or a composite player grade.</p>
    </>}
  </section>;
}
