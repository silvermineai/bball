import { serve } from "@hono/node-server";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Context, Hono } from "hono";
import { cors } from "hono/cors";

type BackfillStatus = {
  state: "idle" | "running" | "succeeded" | "failed";
  id?: string;
  mode?: ScrapeMode;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  pid?: number;
  command?: string[];
  progress: {
    phase?: string;
    totalGames?: number;
    currentGame?: number;
    scraped?: number;
    failed?: number;
    lastContestId?: number;
    lastMessage?: string;
  };
};

type ScrapeMode = "backfill" | "seed-team" | "scrape-pending" | "scrape-game" | "sample-sports";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const stateDir = path.join(repoRoot, ".local", "backfill");
const logPath = path.join(stateDir, "latest.log");
const statusPath = path.join(stateDir, "status.json");
const historyPath = path.join(stateDir, "history.json");
const dbPath = path.join(repoRoot, "data", "ncaa_mbb.sqlite3");
let running: ChildProcessWithoutNullStreams | null = null;
let status: BackfillStatus = { state: "idle", progress: {} };

const app = new Hono();
app.use(
  "*",
  async (c, next) => {
    await next();
    c.header("Access-Control-Allow-Private-Network", "true");
  },
);
app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000", "https://bball-api.bryan-b4b.workers.dev"],
    allowHeaders: ["Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "bball-local-runner" }));

app.get("/backfill/status", async (c) => {
  await loadStatus();
  return c.json(status);
});

app.get("/jobs", async (c) => {
  const page = positiveInt(c.req.query("page"), 1);
  const pageSize = Math.min(positiveInt(c.req.query("pageSize"), 25), 100);
  const history = await loadHistory();
  const start = (page - 1) * pageSize;
  return c.json({ rows: history.slice(start, start + pageSize), page, pageSize, total: history.length });
});

app.get("/backfill/logs", async (c) => {
  try {
    const log = await readFile(logPath, "utf8");
    return c.text(log);
  } catch {
    return c.text("");
  }
});

app.get("/scrape-logs", async (c) => {
  const page = positiveInt(c.req.query("page"), 1);
  const pageSize = Math.min(positiveInt(c.req.query("pageSize"), 25), 100);
  const offset = (page - 1) * pageSize;
  const sqlite = await import("node:child_process");
  const sql = `SELECT id, url, cache_key, status_code, fetched_at, COALESCE(error, '') FROM scrape_logs ORDER BY fetched_at DESC, id DESC LIMIT ${pageSize} OFFSET ${offset};`;
  const countSql = "SELECT COUNT(*) FROM scrape_logs;";
  try {
    const rowsText = sqlite.execFileSync("sqlite3", [dbPath, "-json", sql], { encoding: "utf8" });
    const countText = sqlite.execFileSync("sqlite3", [dbPath, "-json", countSql], { encoding: "utf8" });
    const rows = JSON.parse(rowsText || "[]");
    const countRows = JSON.parse(countText || "[]");
    return c.json({ rows, page, pageSize, total: Number(countRows[0]?.["COUNT(*)"] ?? 0) });
  } catch {
    return c.json({ rows: [], page, pageSize, total: 0 });
  }
});

app.post("/backfill/start", async (c) => {
  return startJob(c, "backfill");
});

app.post("/jobs/start", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return startJob(c, scrapeMode(body.mode) ?? "backfill", body);
});

async function startJob(c: Context, defaultMode: ScrapeMode, parsedBody?: Record<string, unknown>) {
  if (running && running.exitCode === null) {
    return c.json({ error: "Backfill already running", status }, 409);
  }
  const body = parsedBody ?? (await c.req.json().catch(() => ({})));
  const mode = scrapeMode(body.mode) ?? defaultMode;
  const teamId = positiveInt(body.teamId, 609549);
  const maxTeams = positiveInt(body.maxTeams, 1);
  const limit = positiveInt(body.limit, 25);
  const contestId = positiveInt(body.contestId, 6422772);
  const season = String(body.season || "2025-26");
  const sport = String(body.sport || "MBB");
  const division = ["1", "2", "3"].includes(String(body.division)) ? String(body.division) : "1";
  await mkdir(path.dirname(dbPath), { recursive: true });
  await mkdir(stateDir, { recursive: true });

  const command = [
    "uv",
    "run",
    "--project",
    "ncaa_scraper",
    "python",
    "-m",
    "ncaa_scraper.ncaa_db",
    "--db",
    `sqlite:///${dbPath}`,
    "--season",
    season,
    "--sport",
    sport,
    "--division",
    division,
  ];
  if (mode === "backfill") command.push("backfill", "--team-id", String(teamId), "--max-teams", String(maxTeams), "--limit", String(limit));
  if (mode === "seed-team") command.push("seed-team", "--team-id", String(teamId), "--max-teams", String(maxTeams));
  if (mode === "scrape-pending") command.push("scrape-pending", "--limit", String(limit));
  if (mode === "scrape-game") command.push("scrape-game", String(contestId));
  if (mode === "sample-sports") command.push("sample-sports", "--max-teams", String(maxTeams), "--limit", String(limit));

  const id = `${Date.now()}-${mode}`;
  const jobLogPath = path.join(stateDir, `${id}.log`);
  status = {
    id,
    mode,
    state: "running",
    startedAt: new Date().toISOString(),
    command,
    progress: { phase: "starting", lastMessage: "Starting backfill" },
  };
  await saveStatus();
  await writeFile(logPath, `${status.startedAt} ${command.join(" ")}\n`);
  await writeFile(jobLogPath, `${status.startedAt} ${command.join(" ")}\n`);

  const logStream = createWriteStream(logPath, { flags: "a" });
  const jobLogStream = createWriteStream(jobLogPath, { flags: "a" });
  running = spawn(command[0], command.slice(1), { cwd: repoRoot, env: process.env });
  status.pid = running.pid;
  await saveStatus();

  const handleChunk = async (chunk: Buffer) => {
    const text = chunk.toString();
    logStream.write(text);
    jobLogStream.write(text);
    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      updateProgressFromLine(line);
    }
    await saveStatus();
  };

  running.stdout.on("data", (chunk) => void handleChunk(chunk));
  running.stderr.on("data", (chunk) => void handleChunk(chunk));
  running.on("close", async (code) => {
    status.state = code === 0 ? "succeeded" : "failed";
    status.exitCode = code;
    status.finishedAt = new Date().toISOString();
    status.progress.lastMessage = `Backfill ${status.state} with exit code ${code}`;
    logStream.write(`${status.finishedAt} ${status.progress.lastMessage}\n`);
    jobLogStream.write(`${status.finishedAt} ${status.progress.lastMessage}\n`);
    logStream.end();
    jobLogStream.end();
    running = null;
    await appendHistory(status);
    await saveStatus();
  });

  return c.json(status);
}

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function scrapeMode(value: unknown): ScrapeMode | null {
  return value === "backfill" || value === "seed-team" || value === "scrape-pending" || value === "scrape-game" || value === "sample-sports"
    ? value
    : null;
}

function updateProgressFromLine(line: string) {
  status.progress.lastMessage = line;
  if (line.includes("seed start")) status.progress.phase = "seeding";
  if (line.includes("seed complete")) status.progress.phase = "scraping";
  if (line.includes("complete scraped=")) status.progress.phase = "complete";
  const startMatch = line.match(/scrape start pending=(\d+)/);
  if (startMatch) status.progress.totalGames = Number(startMatch[1]);
  const gameMatch = line.match(/game (\d+)\/(\d+) contest_id=(\d+)/);
  if (gameMatch) {
    status.progress.currentGame = Number(gameMatch[1]);
    status.progress.totalGames = Number(gameMatch[2]);
    status.progress.lastContestId = Number(gameMatch[3]);
  }
  const completeMatch = line.match(/complete scraped=(\d+) failed=(\d+)/);
  if (completeMatch) {
    status.progress.scraped = Number(completeMatch[1]);
    status.progress.failed = Number(completeMatch[2]);
  }
}

async function saveStatus() {
  await mkdir(stateDir, { recursive: true });
  await writeFile(statusPath, JSON.stringify(status, null, 2));
}

async function loadStatus() {
  if (running && running.exitCode === null) return;
  try {
    status = JSON.parse(await readFile(statusPath, "utf8")) as BackfillStatus;
  } catch {
    status = { state: "idle", progress: {} };
  }
}

async function loadHistory(): Promise<BackfillStatus[]> {
  try {
    return JSON.parse(await readFile(historyPath, "utf8")) as BackfillStatus[];
  } catch {
    return [];
  }
}

async function appendHistory(job: BackfillStatus) {
  const history = await loadHistory();
  history.unshift(job);
  await writeFile(historyPath, JSON.stringify(history.slice(0, 200), null, 2));
}

serve({ fetch: app.fetch, port: 8790, hostname: "127.0.0.1" }, (info) => {
  console.log(`bball local runner listening on http://${info.address}:${info.port}`);
});
