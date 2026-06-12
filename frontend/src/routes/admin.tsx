import { MetricCard } from "@/components/MetricCard";
import { api } from "@/lib/api";
import { DEFAULT_SPORT, SPORTS } from "@/lib/sports";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Database, Play, RefreshCw, Shield } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type ScrapeMode = "backfill" | "seed-team" | "scrape-pending" | "scrape-game" | "sample-sports";

function AdminPage() {
  const queryClient = useQueryClient();
  const { data: session, isLoading } = useQuery({ queryKey: ["auth", "me"], queryFn: api.me });
  const [mode, setMode] = useState<ScrapeMode>("backfill");
  const [sport, setSport] = useState(DEFAULT_SPORT);
  const [season, setSeason] = useState("2025-26");
  const [division, setDivision] = useState("1");
  const [teamId, setTeamId] = useState(609549);
  const [contestId, setContestId] = useState(6422772);
  const [maxTeams, setMaxTeams] = useState(1);
  const [limit, setLimit] = useState(25);
  const [gamePage, setGamePage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [jobPage, setJobPage] = useState(1);
  const [cloudJobPage, setCloudJobPage] = useState(1);
  const [ingestKeyName, setIngestKeyName] = useState("local backfill");
  const [createdIngestToken, setCreatedIngestToken] = useState("");

  const summary = useQuery({ queryKey: ["admin-summary"], queryFn: api.adminSummary, enabled: Boolean(session?.user?.isAdmin) });
  const games = useQuery({
    queryKey: ["admin-games", gamePage, division, sport],
    queryFn: () => api.adminGames({ page: gamePage, pageSize: 20, division, sport }),
    enabled: Boolean(session?.user?.isAdmin),
  });
  const remoteLogs = useQuery({
    queryKey: ["admin-scrape-logs", logPage],
    queryFn: () => api.adminScrapeLogs({ page: logPage, pageSize: 20 }),
    enabled: Boolean(session?.user?.isAdmin),
  });
  const runnerStatus = useQuery({
    queryKey: ["backfill-status"],
    queryFn: api.backfillStatus,
    refetchInterval: (query) => (query.state.data?.state === "running" ? 1500 : false),
    retry: false,
  });
  const runnerJobs = useQuery({
    queryKey: ["runner-jobs", jobPage],
    queryFn: () => api.runnerJobs(jobPage, 12),
    retry: false,
  });
  const runnerLogs = useQuery({
    queryKey: ["runner-scrape-logs", logPage],
    queryFn: () => api.runnerScrapeLogs(logPage, 20),
    retry: false,
  });
  const cloudJobs = useQuery({
    queryKey: ["admin-scrape-jobs", cloudJobPage],
    queryFn: () => api.adminScrapeJobs({ page: cloudJobPage, pageSize: 20 }),
    enabled: Boolean(session?.user?.isAdmin),
  });
  const ingestKeys = useQuery({
    queryKey: ["admin-ingest-keys"],
    queryFn: api.adminIngestKeys,
    enabled: Boolean(session?.user?.isAdmin),
  });

  const startJob = useMutation({
    mutationFn: () => api.startScrapeJob({ mode, teamId, maxTeams, limit, contestId, season, division, sport }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["backfill-status"] });
      await queryClient.invalidateQueries({ queryKey: ["runner-jobs"] });
    },
  });
  const queueCloudJob = useMutation({
    mutationFn: () => api.createAdminScrapeJob({ mode, teamId, maxTeams, limit, contestId, season, division, sport }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-scrape-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
  const createIngestKey = useMutation({
    mutationFn: () => api.createAdminIngestKey(ingestKeyName),
    onSuccess: async (data) => {
      setCreatedIngestToken(data.token);
      await queryClient.invalidateQueries({ queryKey: ["admin-ingest-keys"] });
    },
  });
  const revokeIngestKey = useMutation({
    mutationFn: (id: string | number) => api.revokeAdminIngestKey(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-ingest-keys"] });
    },
  });

  if (isLoading) return null;
  if (!session?.user?.isAdmin) return <Navigate to="/" />;

  const running = runnerStatus.data?.state === "running";
  const divisionRows = summary.data?.divisions ?? [];
  const statuses = summary.data?.statuses ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-line bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-court">
          <Shield size={16} />
          Admin
        </div>
        <h1 className="mt-2 text-3xl font-semibold">Scrape Control</h1>
        <p className="mt-2 text-sm leading-6 text-graphite">Visible only to bryan@silvermineai.com. Local jobs run through the runner on this computer.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Remote scrape logs" value={summary.data?.logs ?? 0} icon={<Database size={18} />} />
        <MetricCard label="Cloud scrape jobs" value={summary.data?.jobs ?? 0} />
        {divisionRows.map((row) => (
          <MetricCard key={row.division} label={`D${row.division} teams`} value={row.teams} detail={`${row.teamGames} team-games`} />
        ))}
        {statuses.slice(0, 2).map((row) => (
          <MetricCard key={row.status} label={row.status} value={row.games} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-md border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Scrape Job Controls</h2>
          <div className="mt-4 grid gap-3">
            <label className="text-sm font-medium text-graphite">
              Job type
              <select className="mt-1 w-full rounded-md border-line" value={mode} onChange={(event) => setMode(event.target.value as ScrapeMode)}>
                <option value="backfill">Backfill</option>
                <option value="seed-team">Seed team graph</option>
                <option value="scrape-pending">Scrape pending games</option>
                <option value="scrape-game">Scrape one game</option>
                <option value="sample-sports">Sample all sports</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-graphite">
                Sport
                <select className="mt-1 w-full rounded-md border-line" value={sport} onChange={(event) => setSport(event.target.value)}>
                  {SPORTS.map((item) => (
                    <option key={item.code} value={item.code}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-graphite">
                Season
                <input className="mt-1 w-full rounded-md border-line" value={season} onChange={(event) => setSeason(event.target.value)} />
              </label>
              <label className="text-sm font-medium text-graphite">
                Division
                <select className="mt-1 w-full rounded-md border-line" value={division} onChange={(event) => setDivision(event.target.value)}>
                  <option value="1">Men's D1</option>
                  <option value="2">Men's D2</option>
                  <option value="3">Men's D3</option>
                </select>
              </label>
              <NumberInput label="Seed team ID" value={teamId} onChange={setTeamId} />
              <NumberInput label="Game ID" value={contestId} onChange={setContestId} />
              <NumberInput label="Max teams" value={maxTeams} onChange={setMaxTeams} />
              <NumberInput label="Game limit" value={limit} onChange={setLimit} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={running || startJob.isPending || runnerStatus.isError}
                onClick={() => startJob.mutate()}
              >
                {running ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                {running ? "Runner Busy" : "Run Local Scrapling Job"}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                disabled={queueCloudJob.isPending}
                onClick={() => queueCloudJob.mutate()}
              >
                <Database size={16} />
                Queue Cloud Job
              </button>
            </div>
            {runnerStatus.isError ? <p className="text-sm text-miss">Local runner is offline. Start it with cd local_runner && npm run dev.</p> : null}
            {startJob.error ? <p className="text-sm text-miss">{startJob.error.message}</p> : null}
            {queueCloudJob.error ? <p className="text-sm text-miss">{queueCloudJob.error.message}</p> : null}
            {queueCloudJob.isSuccess ? (
              <p className="text-sm text-graphite">
                Cloud job queued in D1. Scrapling execution still needs a Python runner/container because Cloudflare Workers cannot import Scrapling directly.
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-md border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Runner Status</h2>
            <button className="inline-flex items-center gap-2 text-sm font-semibold text-court" onClick={() => void queryClient.invalidateQueries({ queryKey: ["backfill-status"] })}>
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-graphite sm:grid-cols-2">
            <span>State: {runnerStatus.data?.state ?? "offline"}</span>
            <span>Mode: {runnerStatus.data?.mode ?? "-"}</span>
            <span>Phase: {runnerStatus.data?.progress?.phase ?? "-"}</span>
            <span>Game: {runnerStatus.data?.progress?.lastContestId ?? "-"}</span>
          </div>
          <pre className="mt-4 max-h-48 overflow-auto rounded-md bg-ink p-4 text-xs leading-5 text-[#dce8de]">
            {runnerStatus.data?.progress?.lastMessage ?? "No runner message yet."}
          </pre>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Remote D1 Upload Keys</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite">
              Create a scoped API key for the local uploader. The token is shown once; store it as `BBALL_INGEST_API_KEY`.
            </p>
          </div>
          <div className="flex min-w-80 flex-col gap-2 sm:flex-row">
            <input
              className="rounded-md border-line"
              value={ingestKeyName}
              onChange={(event) => setIngestKeyName(event.target.value)}
              placeholder="Key name"
            />
            <button
              className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={createIngestKey.isPending}
              onClick={() => createIngestKey.mutate()}
            >
              Create key
            </button>
          </div>
        </div>
        {createdIngestToken ? (
          <div className="mt-4 rounded-md border border-brass/30 bg-[#fff7ea] p-3">
            <div className="text-sm font-semibold">New token</div>
            <code className="mt-2 block overflow-auto rounded-md bg-white p-2 text-xs">{createdIngestToken}</code>
          </div>
        ) : null}
        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-[0.16em] text-court">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Prefix</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Last used</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(ingestKeys.data?.keys ?? []).map((key) => (
                <tr key={String(key.id)} className="border-t border-line">
                  <td className="px-3 py-2 font-medium">{String(key.name ?? "")}</td>
                  <td className="px-3 py-2 text-graphite">{String(key.tokenPrefix ?? "")}</td>
                  <td className="px-3 py-2 text-graphite">{String(key.createdAt ?? "")}</td>
                  <td className="px-3 py-2 text-graphite">{String(key.lastUsedAt ?? "-")}</td>
                  <td className="px-3 py-2 text-graphite">{key.revokedAt ? "revoked" : "active"}</td>
                  <td className="px-3 py-2 text-right">
                    {!key.revokedAt ? (
                      <button className="text-sm font-semibold text-miss" onClick={() => revokeIngestKey.mutate(String(key.id))}>
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <PaginatedTable title="Cloud Scrape Jobs" rows={cloudJobs.data?.rows ?? []} page={cloudJobPage} total={cloudJobs.data?.total ?? 0} setPage={setCloudJobPage} />
        <PaginatedTable title="Remote Games" rows={games.data?.rows ?? []} page={gamePage} total={games.data?.total ?? 0} setPage={setGamePage} />
        <PaginatedTable title="Remote Scrape Logs" rows={remoteLogs.data?.rows ?? []} page={logPage} total={remoteLogs.data?.total ?? 0} setPage={setLogPage} />
        <PaginatedTable title="Local Job History" rows={runnerJobs.data?.rows ?? []} page={jobPage} total={runnerJobs.data?.total ?? 0} setPage={setJobPage} />
        <PaginatedTable title="Local SQLite Scrape Logs" rows={runnerLogs.data?.rows ?? []} page={logPage} total={runnerLogs.data?.total ?? 0} setPage={setLogPage} />
      </section>
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-sm font-medium text-graphite">
      {label}
      <input className="mt-1 w-full rounded-md border-line" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function PaginatedTable({
  title,
  rows,
  page,
  total,
  setPage,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  page: number;
  total: number;
  setPage: (page: number) => void;
}) {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 6);
  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="text-sm text-graphite">{total} rows</div>
      </div>
      <div className="mt-4 overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase tracking-[0.16em] text-court">
            <tr>{keys.map((key) => <th key={key} className="px-3 py-2">{key}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-line">
                {keys.map((key) => (
                  <td key={key} className="max-w-64 truncate px-3 py-2 text-graphite">{String(row[key] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <div className="rounded-b-md border-t border-line px-3 py-6 text-sm text-graphite">No rows yet.</div> : null}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button className="rounded-md border border-line px-3 py-1 text-sm disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Prev
        </button>
        <span className="text-sm text-graphite">Page {page}</span>
        <button className="rounded-md border border-line px-3 py-1 text-sm disabled:opacity-40" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
