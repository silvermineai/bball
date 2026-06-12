import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Play, RefreshCw, Terminal } from "lucide-react";
import { useState } from "react";

type BackfillStatus = {
  state: "idle" | "running" | "succeeded" | "failed";
  startedAt?: string;
  finishedAt?: string;
  pid?: number;
  progress?: {
    phase?: string;
    totalGames?: number;
    currentGame?: number;
    scraped?: number;
    failed?: number;
    lastContestId?: number;
    lastMessage?: string;
  };
};

export function BackfillPanel() {
  const queryClient = useQueryClient();
  const [teamId, setTeamId] = useState(609549);
  const [maxTeams, setMaxTeams] = useState(1);
  const [limit, setLimit] = useState(25);

  const statusQuery = useQuery<BackfillStatus>({
    queryKey: ["backfill-status"],
    queryFn: api.backfillStatus,
    refetchInterval: (query) => (query.state.data?.state === "running" ? 1500 : false),
    retry: false,
  });
  const logQuery = useQuery({
    queryKey: ["backfill-logs"],
    queryFn: api.backfillLogs,
    refetchInterval: statusQuery.data?.state === "running" ? 1500 : false,
    retry: false,
  });
  const start = useMutation({
    mutationFn: () => api.startBackfill({ teamId, maxTeams, limit }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["backfill-status"] });
      await queryClient.invalidateQueries({ queryKey: ["backfill-logs"] });
    },
  });

  const status = statusQuery.data;
  const runnerOnline = !statusQuery.isError;
  const running = status?.state === "running";
  const progressValue =
    status?.progress?.totalGames && status.progress.currentGame
      ? Math.round((status.progress.currentGame / status.progress.totalGames) * 100)
      : status?.state === "succeeded"
        ? 100
        : 0;

  return (
    <section className="rounded-md border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-court">
            <Database size={15} />
            Local Backfill
          </div>
          <h2 className="mt-2 text-xl font-semibold">Run NCAA scraper on this computer</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite">
            Starts a localhost process that seeds teams from UConn, scrapes pending games, and writes progress to
            `.local/backfill/latest.log`.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!runnerOnline || running || start.isPending}
          onClick={() => start.mutate()}
        >
          {running ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
          {running ? "Backfill Running" : "Start Backfill"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <label className="text-sm font-medium text-graphite">
          Seed team ID
          <input className="mt-1 w-full rounded-md border-line" type="number" value={teamId} onChange={(event) => setTeamId(Number(event.target.value))} />
        </label>
        <label className="text-sm font-medium text-graphite">
          Max teams
          <input className="mt-1 w-full rounded-md border-line" type="number" min={1} max={400} value={maxTeams} onChange={(event) => setMaxTeams(Number(event.target.value))} />
        </label>
        <label className="text-sm font-medium text-graphite">
          Game limit
          <input className="mt-1 w-full rounded-md border-line" type="number" min={1} max={5000} value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
        </label>
      </div>

      <div className="mt-5 rounded-md border border-line bg-paper p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold">
            Status: <span className={statusColor(status?.state)}>{runnerOnline ? (status?.state ?? "idle") : "runner offline"}</span>
          </div>
          <button
            className="inline-flex items-center gap-2 text-sm font-semibold text-court"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["backfill-status"] });
              void queryClient.invalidateQueries({ queryKey: ["backfill-logs"] });
            }}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-court transition-all" style={{ width: `${progressValue}%` }} />
        </div>
        <div className="mt-3 grid gap-2 text-sm text-graphite md:grid-cols-4">
          <span>Phase: {status?.progress?.phase ?? "-"}</span>
          <span>Game: {status?.progress?.currentGame ?? 0}/{status?.progress?.totalGames ?? 0}</span>
          <span>Game: {status?.progress?.lastContestId ?? "-"}</span>
          <span>PID: {status?.pid ?? "-"}</span>
        </div>
        {start.error ? <p className="mt-3 text-sm font-medium text-miss">{start.error.message}</p> : null}
        {!runnerOnline ? (
          <p className="mt-3 text-sm text-graphite">Start the local runner with `cd local_runner && npm run dev`.</p>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Terminal size={16} className="text-court" />
          Progress Log
        </div>
        <pre className="max-h-72 overflow-auto rounded-md bg-ink p-4 text-xs leading-5 text-[#dce8de]">
          {logQuery.data || status?.progress?.lastMessage || "No log yet."}
        </pre>
      </div>
    </section>
  );
}

function statusColor(state?: string) {
  if (state === "running") return "text-brass";
  if (state === "succeeded") return "text-make";
  if (state === "failed") return "text-miss";
  return "text-graphite";
}
