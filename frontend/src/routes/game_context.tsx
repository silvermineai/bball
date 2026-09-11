import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, Gavel } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/game_context")({ component: GameContextDesk });

type ContextRow = {
  game_id: string;
  team_id?: string;
  athlete_id?: string;
  team_name?: string;
  athlete_name?: string;
  home_away?: string;
  starter?: number;
  did_not_play?: number;
  active?: number;
  ejected?: number;
  reason?: string;
  official_order?: number;
  official_name?: string;
  official_position?: string;
};
type ContextResponse = { total: number; rows: ContextRow[]; source?: { url?: string; fetched_at?: string; sha256?: string } | null };

function GameContextDesk() {
  const [view, setView] = useState<"rosters" | "officials">("rosters");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["ncaa-game-context", view],
    queryFn: async () => {
      const response = await fetch(`/api/basketball/research/ncaa-game-context?view=${view}&season=2026`);
      if (!response.ok) throw new Error("Could not load game context");
      return (await response.json()) as ContextResponse;
    },
    staleTime: 300_000,
  });

  return (
    <div className="space-y-8">
      <div className="rise rise-1">
        <div className="font-stat text-[11px] uppercase tracking-[0.22em] text-court">Game context</div>
        <h1 className="font-display text-4xl font-semibold">Who dressed, who started, who called it</h1>
        <p className="mt-2 max-w-3xl text-sm text-graphite">
          Source-native ESPN game rosters and officiating assignments. Use this desk to verify availability and preserve the context around every matchup before trusting a box score.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setView("rosters")} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${view === "rosters" ? "border-ink bg-ink text-white" : "border-line bg-white text-graphite"}`}><ClipboardCheck size={15} /> Game rosters</button>
        <button type="button" onClick={() => setView("officials")} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${view === "officials" ? "border-ink bg-ink text-white" : "border-line bg-white text-graphite"}`}><Gavel size={15} /> Officials</button>
      </div>

      <section className="rounded-lg border border-line bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="font-stat text-xs uppercase tracking-wider text-graphite">2025–26 archive</div>
          <div className="font-stat text-xs text-graphite">{isLoading ? "Loading…" : isError ? "Unavailable" : `${(data?.total ?? 0).toLocaleString()} rows`}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper font-stat text-[10px] uppercase tracking-wider text-graphite">
              <tr>{view === "rosters" ? <><th className="px-4 py-3">Game</th><th className="px-4 py-3">Team</th><th className="px-4 py-3">Player</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th></> : <><th className="px-4 py-3">Game</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Official</th><th className="px-4 py-3">Position</th></>}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(data?.rows ?? []).slice(0, 100).map((row, index) => (
                <tr key={`${row.game_id}-${row.athlete_id ?? row.official_order}-${index}`} className="hover:bg-paper/60">
                  <td className="px-4 py-3 font-stat text-xs text-graphite">{row.game_id}</td>
                  {view === "rosters" ? <><td className="px-4 py-3">{row.team_name ?? row.team_id}</td><td className="px-4 py-3 font-medium">{row.athlete_name ?? row.athlete_id}</td><td className="px-4 py-3 text-graphite">{row.starter ? "Starter" : "Bench"}</td><td className="px-4 py-3 text-graphite">{row.did_not_play ? row.reason ?? "DNP" : row.active ? "Active" : "Inactive"}</td></> : <><td className="px-4 py-3 font-stat">{row.official_order}</td><td className="px-4 py-3 font-medium">{row.official_name}</td><td className="px-4 py-3 text-graphite">{row.official_position}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.source?.url ? <div className="border-t border-line px-4 py-3 font-stat text-[10px] text-graphite">Source receipt: {new Date(data.source.fetched_at ?? "").toLocaleString()} · <a href={data.source.url} className="underline" target="_blank" rel="noreferrer">SportsDataverse release</a></div> : null}
      </section>
    </div>
  );
}
