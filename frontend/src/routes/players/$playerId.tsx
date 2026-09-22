import { MetricCard } from "@/components/MetricCard";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ShotChart } from "@/components/ShotChart";
import { SortableTable } from "@/components/SortableTable";
import { api } from "@/lib/api";
import type { GameListItem, NcaaPlayerCard, NcaaPlayerSeasonRow, PlayerSummary, Shot } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, Target } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/players/$playerId")({
  component: PlayerDetailPage,
});

function PlayerDetailPage() {
  const { playerId } = Route.useParams();
  const [lastN, setLastN] = useState("5");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const queryString = lastN === "date" ? `?from=${from}&to=${to}` : `?lastN=${lastN}`;
  const { data } = useQuery({ queryKey: ["player", playerId, queryString], queryFn: () => api.player(playerId, queryString) });
  const player = data?.player;
  const ncaaPlayerId = (player as { ncaaPlayerId?: string | number } | undefined)?.ncaaPlayerId;
  const { data: ncaaCard } = useQuery({
    queryKey: ["ncaa-player-card", ncaaPlayerId],
    queryFn: () => api.ncaaPlayerCard(ncaaPlayerId as string | number),
    enabled: ncaaPlayerId != null,
  });
  const { data: ncaaRanking } = useQuery({
    queryKey: ["ncaa-player-ranking", ncaaPlayerId],
    queryFn: () => api.ncaaPlayerRanking(ncaaPlayerId as string | number),
    enabled: ncaaPlayerId != null,
  });
  const summary = data?.summary as PlayerSummary | null | undefined;
  const gameLog = data?.gameLog ?? [];
  const shots = (data?.shots ?? []) as Shot[];
  const hasUnmapped = shots.some((shot) => !shot.playerId);

  const columns = useMemo<ColumnDef<GameListItem>[]>(
    () => [
      { accessorKey: "date", header: "Date" },
      {
        id: "matchup",
        header: "Game",
        cell: ({ row }) => `${row.original.awayTeam ?? ""} at ${row.original.homeTeam ?? ""}`,
      },
      { accessorKey: "awayScore", header: "Away" },
      { accessorKey: "homeScore", header: "Home" },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-court">Player Detail</div>
            <h1 className="mt-2 text-3xl font-semibold">{player?.name ?? "Player"}</h1>
            <p className="mt-2 text-graphite">Player profile · {player?.id ?? playerId}</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="self-start md:self-end">
              <FavoriteButton type="player" id={player?.id ?? playerId} initialFavorite={Boolean(player?.isFavorite)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <select className="rounded-md border-line" value={lastN} onChange={(event) => setLastN(event.target.value)}>
                <option value="5">Last 5</option>
                <option value="10">Last 10</option>
                <option value="50">All scraped</option>
                <option value="date">Date range</option>
              </select>
              <input className="rounded-md border-line disabled:opacity-40" type="date" value={from} disabled={lastN !== "date"} onChange={(event) => setFrom(event.target.value)} />
              <input className="rounded-md border-line disabled:opacity-40" type="date" value={to} disabled={lastN !== "date"} onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="PPG" value={summary?.ppg ?? "-"} detail={`${summary?.games ?? 0} games`} />
        <MetricCard label="RPG" value={summary?.rpg ?? "-"} />
        <MetricCard label="APG" value={summary?.apg ?? "-"} />
        <MetricCard label="Shooting" value={summary?.fga ? `${summary.fgm}/${summary.fga}` : "-"} detail={summary?.threeFga ? `3PT ${summary.threeFgm}/${summary.threeFga}` : undefined} icon={<Target size={18} />} />
      </section>

      {ncaaCard ? <NcaaSourceCard card={ncaaCard} ranking={ncaaRanking?.rows[0] ?? null} /> : null}

      {hasUnmapped ? (
        <div className="flex items-center gap-2 rounded-md border border-brass/30 bg-[#fff7ea] px-4 py-3 text-sm text-graphite">
          <AlertCircle size={16} className="text-brass" />
          Some shots are still name-only because the source row could not be safely mapped to a canonical player.
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <ShotChart shots={shots} title="Player Shot Map" />
        <div>
          <h2 className="mb-3 text-lg font-semibold">Game Log</h2>
          <SortableTable data={gameLog} columns={columns} />
        </div>
      </section>
    </div>
  );
}

function NcaaSourceCard({ card, ranking }: { card: NcaaPlayerCard; ranking: { rank?: number | null; value?: number | null } | null }) {
  const current = card.seasons.find((row) => row.season === card.selected_season) ?? card.seasons[0];
  const impact = card.impact ?? {};
  const shooting = card.shooting.find((row) => row.season === card.selected_season) ?? card.shooting[0];
  return (
    <section className="rounded-md border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-court">NCAA source archive</div>
          <h2 className="mt-1 text-xl font-semibold">Season stats and player impact</h2>
        </div>
        <div className="text-sm text-graphite">Source season {card.selected_season} · ID {card.player_id}{ranking?.rank != null ? ` · PPG rank #${ranking.rank}` : ""}</div>
      </div>
      {current ? <SeasonStatTable row={current} /> : <p className="mt-4 text-sm text-graphite">No season aggregate is retained for this player.</p>}
      {shooting ? (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-graphite">Shooting profile</h3>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Rim" value={firstStat(shooting.stats, ["rim_pct", "rimPct"])} />
            <StatTile label="Mid" value={firstStat(shooting.stats, ["mid_pct", "midPct"])} />
            <StatTile label="3PT" value={firstStat(shooting.stats, ["three_pct", "threePct", "three_point_pct"])} />
            <StatTile label="FT" value={firstStat(shooting.stats, ["ft_pct", "ftPct"])} />
            <StatTile label="Rim share" value={firstStat(shooting.stats, ["rim_share", "rimShare"])} suffix="%" />
            <StatTile label="3PT share" value={firstStat(shooting.stats, ["three_share", "threeShare"])} suffix="%" />
          </div>
        </div>
      ) : null}
      {Object.keys(impact).length ? (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-graphite">Impact model fields</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(["rapm_net", "orapm", "drapm", "balanced_index", "impact_index"] as const).map((key) => (
              <StatTile key={key} label={impactLabel(key)} value={impact[key]} />
            ))}
          </div>
        </div>
      ) : null}
      <p className="mt-4 text-xs leading-5 text-graphite">
        These fields are rendered from the retained NCAA player-season and shooting rows for the exact source player ID. Missing values remain unavailable.
      </p>
    </section>
  );
}

function SeasonStatTable({ row }: { row: NcaaPlayerSeasonRow }) {
  const stats = row.stats;
  const cells = [
    ["G", firstStat(stats, ["games", "games_played"])],
    ["PTS", firstStat(stats, ["pts", "points"])],
    ["REB", firstStat(stats, ["reb", "total_rebounds", "rebounds"])],
    ["AST", firstStat(stats, ["ast", "assists"])],
    ["STL", firstStat(stats, ["stl", "steals"])],
    ["BLK", firstStat(stats, ["blk", "blocks"])],
    ["PPG", firstStat(stats, ["ppg", "points_per_game"])],
    ["MPG", firstStat(stats, ["mpg", "minutes_per_game"])],
  ];
  return (
    <div className="mt-4 overflow-x-auto rounded-md border border-line">
      <table className="min-w-full text-sm">
        <caption className="sr-only">NCAA source season statistics</caption>
        <thead className="bg-paper text-left text-xs uppercase tracking-[0.12em] text-graphite"><tr><th className="px-3 py-2">Season</th><th className="px-3 py-2">Team</th>{cells.map(([label]) => <th key={label} className="px-3 py-2 text-right">{label}</th>)}</tr></thead>
        <tbody><tr className="border-t border-line"><td className="px-3 py-2 font-semibold">{row.season}</td><td className="px-3 py-2">{row.team_name ?? "—"}</td>{cells.map(([label, value]) => <td key={label} className="px-3 py-2 text-right font-stat">{formatStat(value)}</td>)}</tr></tbody>
      </table>
    </div>
  );
}

function StatTile({ label, value, suffix = "" }: { label: string; value: unknown; suffix?: string }) {
  return <div className="rounded-md border border-line bg-paper px-3 py-2"><div className="text-xs text-graphite">{label}</div><div className="mt-1 font-stat text-lg font-semibold">{formatStat(value)}{value != null && value !== "" ? suffix : ""}</div></div>;
}

function firstStat(stats: Record<string, number | string | null>, keys: string[]) {
  for (const key of keys) if (stats[key] != null && stats[key] !== "") return stats[key];
  return null;
}

function formatStat(value: unknown) {
  if (value == null || value === "") return "—";
  return typeof value === "number" ? (Number.isInteger(value) ? String(value) : value.toFixed(1)) : String(value);
}

function impactLabel(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
