import { MetricCard } from "@/components/MetricCard";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ShotChart } from "@/components/ShotChart";
import { SortableTable } from "@/components/SortableTable";
import { api } from "@/lib/api";
import type { GameListItem, PlayerSummary, Shot } from "@/types";
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
