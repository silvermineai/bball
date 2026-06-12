import { SortableTable } from "@/components/SortableTable";
import { api } from "@/lib/api";
import { SPORTS } from "@/lib/sports";
import { useSelectedSport } from "@/lib/useSelectedSport";
import type { TeamListItem } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/teams/")({
  component: TeamsPage,
});

function TeamsPage() {
  const [q, setQ] = useState("");
  const [sport, setSport] = useSelectedSport();
  const { data } = useQuery({ queryKey: ["teams", q, sport], queryFn: () => api.teams(q, sport) });
  const teams = data?.teams ?? [];
  const columns = useMemo<ColumnDef<TeamListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Team",
        cell: ({ row }) => (
          <Link className="font-semibold text-ink hover:text-court" to="/teams/$teamId" params={{ teamId: String(row.original.id) }}>
            {row.original.name}
          </Link>
        ),
      },
      { accessorKey: "record", header: "Record" },
      { accessorKey: "games", header: "Games" },
      { accessorKey: "pointsFor", header: "PF/G" },
      { accessorKey: "pointsAgainst", header: "PA/G" },
      {
        id: "margin",
        header: "Margin",
        accessorFn: (row) => Number(row.pointsFor ?? 0) - Number(row.pointsAgainst ?? 0),
        cell: ({ getValue }) => Number(getValue()).toFixed(1),
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Teams</h1>
          <p className="mt-2 text-graphite">Scan the field, then open a team for games, players, and shot profile.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[12rem_20rem]">
          <select className="rounded-md border-line bg-white" value={sport} onChange={(event) => setSport(event.target.value)}>
            {SPORTS.map((item) => (
              <option key={item.code} value={item.code}>{item.label}</option>
            ))}
          </select>
          <input
            className="w-full rounded-md border-line bg-white"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Filter teams"
          />
        </div>
      </div>
      <SortableTable data={teams} columns={columns} />
    </div>
  );
}
