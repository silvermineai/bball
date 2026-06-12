import { SortableTable } from "@/components/SortableTable";
import { api } from "@/lib/api";
import { SPORTS } from "@/lib/sports";
import { useSelectedSport } from "@/lib/useSelectedSport";
import type { PlayerListItem } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/players/")({
  component: PlayersPage,
});

function PlayersPage() {
  const [q, setQ] = useState("");
  const [sport, setSport] = useSelectedSport();
  const { data } = useQuery({ queryKey: ["players", q, sport], queryFn: () => api.players(q, sport) });
  const players = data?.players ?? [];
  const columns = useMemo<ColumnDef<PlayerListItem>[]>(
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
      { accessorKey: "teamName", header: "Team" },
      { accessorKey: "position", header: "Pos" },
      { accessorKey: "games", header: "G" },
      ...(sport === "s_mbb" || sport === "s_wbb"
        ? [
            { accessorKey: "ppg", header: "PPG" },
            { accessorKey: "rpg", header: "RPG" },
            { accessorKey: "apg", header: "APG" },
          ]
        : [{ accessorKey: "statGroups", header: "Stat Groups" }]),
    ],
    [sport],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Players</h1>
          <p className="mt-2 text-graphite">Find player form, box-score trends, and shot locations.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[12rem_20rem]">
          <select className="rounded-md border-line bg-white" value={sport} onChange={(event) => setSport(event.target.value)}>
            {SPORTS.map((item) => (
              <option key={item.code} value={item.code}>{item.label}</option>
            ))}
          </select>
          <input className="w-full rounded-md border-line bg-white" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Filter players" />
        </div>
      </div>
      <SortableTable data={players} columns={columns} />
    </div>
  );
}
