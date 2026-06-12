import { SortableTable } from "@/components/SortableTable";
import { api } from "@/lib/api";
import { SPORTS } from "@/lib/sports";
import { useSelectedSport } from "@/lib/useSelectedSport";
import type { GameListItem } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/games/")({
  component: GamesPage,
});

function GamesPage() {
  const [sport, setSport] = useSelectedSport();
  const { data } = useQuery({ queryKey: ["games", sport], queryFn: () => api.games(sport) });
  const games = data?.games ?? [];
  const columns = useMemo<ColumnDef<GameListItem>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Game",
        cell: ({ row }) => (
          <Link className="font-semibold text-ink hover:text-court" to="/games/$contestId" params={{ contestId: String(row.original.id) }}>
            {row.original.id}
          </Link>
        ),
      },
      { accessorKey: "date", header: "Date" },
      { accessorKey: "awayTeam", header: "Away" },
      { accessorKey: "awayScore", header: "Away Pts" },
      { accessorKey: "homeTeam", header: "Home" },
      { accessorKey: "homeScore", header: "Home Pts" },
      { accessorKey: "venue", header: "Venue" },
    ],
    [],
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Games</h1>
          <p className="mt-2 text-graphite">Open a game for box-score context, player stats, shots, and play-by-play.</p>
        </div>
        <select className="w-full rounded-md border-line bg-white md:w-64" value={sport} onChange={(event) => setSport(event.target.value)}>
          {SPORTS.map((item) => (
            <option key={item.code} value={item.code}>{item.label}</option>
          ))}
        </select>
      </div>
      <SortableTable data={games} columns={columns} />
    </div>
  );
}
