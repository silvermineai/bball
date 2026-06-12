import { MetricCard } from "@/components/MetricCard";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ShotChart } from "@/components/ShotChart";
import { SortableTable } from "@/components/SortableTable";
import { api } from "@/lib/api";
import type { GameListItem, PlayerListItem } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarDays, Target, UsersRound } from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/teams/$teamId")({
  component: TeamDetailPage,
});

function TeamDetailPage() {
  const { teamId } = Route.useParams();
  const { data } = useQuery({ queryKey: ["team", teamId], queryFn: () => api.team(teamId) });
  const team = data?.team;
  const games = data?.games ?? [];
  const players = data?.players ?? [];
  const shots = data?.shots ?? [];

  const playerColumns = useMemo<ColumnDef<PlayerListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Player",
        cell: ({ row }) => (
          <Link className="font-semibold text-ink hover:text-court" to="/players/$playerId" params={{ playerId: String(row.original.id) }}>
            {row.original.name}
          </Link>
        ),
      },
      { accessorKey: "position", header: "Pos" },
      { accessorKey: "games", header: "G" },
      { accessorKey: "ppg", header: "PPG" },
      { accessorKey: "rpg", header: "RPG" },
      { accessorKey: "apg", header: "APG" },
      { accessorKey: "fga", header: "FGA" },
      { accessorKey: "threeFga", header: "3FGA" },
    ],
    [],
  );
  const gameColumns = useMemo<ColumnDef<GameListItem>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Game",
        cell: ({ row }) => (
          <Link className="font-semibold text-ink hover:text-court" to="/games/$contestId" params={{ contestId: String(row.original.id) }}>
            {row.original.awayTeam} at {row.original.homeTeam}
          </Link>
        ),
      },
      { accessorKey: "date", header: "Date" },
      { accessorKey: "venue", header: "Venue" },
      { accessorKey: "awayScore", header: "Away" },
      { accessorKey: "homeScore", header: "Home" },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-line bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-court">Team Room</div>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">{team?.name ?? "Team"}</h1>
            <p className="mt-2 text-graphite">{team?.season ?? "Current season"} · {team?.record ?? "Record unavailable"}</p>
          </div>
          <FavoriteButton type="team" id={team?.id ?? teamId} initialFavorite={Boolean(team?.isFavorite)} />
        </div>
      </div>
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Games" value={games.length} icon={<CalendarDays size={18} />} />
        <MetricCard label="Players" value={players.length} icon={<UsersRound size={18} />} />
        <MetricCard label="Shots" value={shots.length} detail="Mapped to this team" icon={<Target size={18} />} />
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <div>
            <h2 className="mb-3 text-lg font-semibold">Player Form</h2>
            <SortableTable data={players} columns={playerColumns} />
          </div>
          <div>
            <h2 className="mb-3 text-lg font-semibold">Games</h2>
            <SortableTable data={games} columns={gameColumns} />
          </div>
        </div>
        <ShotChart shots={shots} title="Team Shot Profile" />
      </section>
    </div>
  );
}
