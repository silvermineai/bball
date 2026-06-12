import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Printer, RefreshCcw } from "lucide-react";
import { useMemo } from "react";
import { SectionTitle, TeamMark, TeamPicker, TierBadge } from "@/components/Annual";
import { buildGameKeys, commonOpponents, insights, pctColor, projectMatchup } from "@/lib/insights";
import type { ScoutReport, TeamIndexEntry, Venue } from "@/lib/insights";

type GameplanSearch = { a?: number; b?: number; venue?: Venue };

export const Route = createFileRoute("/gameplan")({
  component: GamePlanPage,
  validateSearch: (search: Record<string, unknown>): GameplanSearch => ({
    a: search.a ? Number(search.a) : undefined,
    b: search.b ? Number(search.b) : undefined,
    venue: (["neutral", "teamA", "teamB"] as const).includes(search.venue as Venue) ? (search.venue as Venue) : undefined,
  }),
});

const FACTORS: { key: string; label: string; suffix?: string }[] = [
  { key: "offEff", label: "Offensive efficiency" },
  { key: "defEff", label: "Defensive efficiency" },
  { key: "efg", label: "eFG%", suffix: "%" },
  { key: "tovPct", label: "Turnover rate", suffix: "%" },
  { key: "orbPct", label: "Off. rebound rate", suffix: "%" },
  { key: "ftRate", label: "FT rate" },
  { key: "threePct", label: "Three-point %", suffix: "%" },
  { key: "pace", label: "Pace (poss/g)" },
];

function GamePlanPage() {
  const navigate = useNavigate({ from: "/gameplan" });
  const { a, b, venue = "neutral" } = Route.useSearch();
  const { data: teamsData } = useQuery({ queryKey: ["insights", "teams"], queryFn: insights.teams, staleTime: Infinity });
  const { data: meta } = useQuery({ queryKey: ["insights", "meta"], queryFn: insights.meta, staleTime: Infinity });

  const teams = teamsData?.teams ?? [];
  const teamA = useMemo(() => teams.find((t) => t.id === a) ?? null, [teams, a]);
  const teamB = useMemo(() => teams.find((t) => t.id === b) ?? null, [teams, b]);

  const scouts = useQueries({
    queries: [a, b].map((id) => ({
      queryKey: ["insights", "scout", String(id)],
      queryFn: () => insights.scout(id!),
      enabled: id != null,
      staleTime: Infinity,
    })),
  });
  const scoutA = a != null ? scouts[0]?.data : undefined;
  const scoutB = b != null ? scouts[1]?.data : undefined;

  const projection = scoutA && scoutB && meta ? projectMatchup(scoutA, scoutB, venue, meta) : null;
  const keys = scoutA && scoutB ? buildGameKeys(scoutA, scoutB) : [];
  const common = scoutA && scoutB ? commonOpponents(scoutA, scoutB) : [];
  const headToHead = scoutA && scoutB ? scoutA.schedule.filter((g) => g.opponentId === scoutB.identity.id) : [];

  function setTeam(side: "a" | "b", team: TeamIndexEntry) {
    navigate({ search: (prev) => ({ ...prev, [side]: team.id }), resetScroll: false });
  }

  return (
    <div className="space-y-8">
      <div className="rise rise-1 no-print flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="font-stat text-[11px] uppercase tracking-[0.22em] text-court">The War Room</div>
          <h1 className="font-display text-4xl font-semibold">Game Plan</h1>
          <p className="mt-2 max-w-xl text-sm text-graphite">
            Pick your team and the opponent. The model projects the game from schedule-adjusted ratings and builds your keys to victory.
          </p>
        </div>
        <div className="grid items-end gap-2 sm:grid-cols-[16rem_16rem_auto]">
          <div>
            <div className="mb-1 font-stat text-[10px] uppercase tracking-wider text-graphite">Your team</div>
            <TeamPicker teams={teams} value={teamA} onChange={(t) => setTeam("a", t)} />
          </div>
          <div>
            <div className="mb-1 font-stat text-[10px] uppercase tracking-wider text-graphite">Opponent</div>
            <TeamPicker teams={teams} value={teamB} onChange={(t) => setTeam("b", t)} />
          </div>
          <div className="flex gap-2">
            <select
              className="rounded-md border-line bg-white text-sm"
              value={venue}
              onChange={(e) => navigate({ search: (prev) => ({ ...prev, venue: e.target.value as Venue }), resetScroll: false })}
            >
              <option value="neutral">Neutral court</option>
              <option value="teamA">{teamA?.shortName ?? "Your"} home</option>
              <option value="teamB">{teamB?.shortName ?? "Their"} home</option>
            </select>
            <button
              type="button"
              title="Swap teams"
              className="rounded-md border border-line bg-white px-3 transition hover:border-court"
              onClick={() => navigate({ search: (prev) => ({ ...prev, a: b, b: a }), resetScroll: false })}
            >
              <RefreshCcw size={15} />
            </button>
          </div>
        </div>
      </div>

      {!scoutA || !scoutB ? (
        <EmptyState teams={teams} onPick={(idA, idB) => navigate({ search: { a: idA, b: idB, venue: "neutral" } })} />
      ) : (
        <>
          {/* scoreboard projection */}
          {projection ? (
            <section className="rise rise-2 print-block overflow-hidden rounded-lg bg-ink text-paper grain relative">
              <div className="grid sm:grid-cols-[1fr_auto_1fr]">
                <TeamSide scout={scoutA} score={projection.scoreA} winProb={projection.winProbA} right={false} />
                <div className="relative z-10 flex flex-col items-center justify-center gap-1 px-6 py-8">
                  <div className="font-stat text-[10px] uppercase tracking-[0.25em] text-white/50">Projection</div>
                  <div className="font-display text-lg italic text-brass">vs</div>
                  <div className="font-stat text-[11px] text-white/60">
                    {venue === "neutral" ? "Neutral court" : venue === "teamA" ? `at ${scoutA.identity.shortName}` : `at ${scoutB.identity.shortName}`}
                  </div>
                  <div className="font-stat text-[11px] text-white/60">~{projection.pace} possessions</div>
                </div>
                <TeamSide scout={scoutB} score={projection.scoreB} winProb={1 - projection.winProbA} right />
              </div>
              {/* win prob bar */}
              <div className="relative h-2.5 w-full bg-white/10">
                <div
                  className="bar-sweep h-full"
                  style={{
                    width: `${Math.round(projection.winProbA * 100)}%`,
                    background: `#${scoutA.identity.color ?? "567a62"}`,
                  }}
                />
              </div>
              <div className="flex justify-between px-4 py-2 font-stat text-[11px] text-white/70">
                <span>
                  {scoutA.identity.shortName} {Math.round(projection.winProbA * 100)}%
                </span>
                <span>
                  {scoutB.identity.shortName} {Math.round((1 - projection.winProbA) * 100)}%
                </span>
              </div>
            </section>
          ) : null}

          {/* keys to the game */}
          <section className="rise rise-3 print-block">
            <SectionTitle
              kicker="Whiteboard"
              title="Keys to the game"
              right={
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="no-print inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-1.5 text-sm transition hover:border-court"
                >
                  <Printer size={14} />
                  Print sheet
                </button>
              }
            />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {keys.map((k, i) => (
                <div key={i} className="rounded-lg border border-line bg-white p-5 shadow-panel">
                  <div className="flex items-center justify-between">
                    <span className="ghost-numeral text-4xl">{i + 1}</span>
                    {k.edge !== "even" ? (
                      <span className="font-stat text-[10px] uppercase tracking-wider text-graphite">
                        edge: <b className="text-ink">{k.edge === "A" ? scoutA.identity.abbrev : scoutB.identity.abbrev}</b>
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 font-display text-lg font-semibold leading-snug">{k.title}</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-graphite">{k.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* tale of the tape */}
          <section className="rise rise-4 print-block">
            <SectionTitle kicker="Tale of the tape" title="Side by side" />
            <div className="mt-3 overflow-hidden rounded-lg border border-line bg-white shadow-panel">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-paper px-4 py-3">
                <TeamMark team={scoutA.identity} size={26} bold />
                <span className="font-stat text-[10px] uppercase tracking-widest text-graphite">national percentile</span>
                <span className="justify-self-end">
                  <TeamMark team={scoutB.identity} size={26} bold />
                </span>
              </div>
              {FACTORS.map((f) => {
                const va = scoutA.metrics[f.key];
                const vb = scoutB.metrics[f.key];
                const pa = scoutA.percentiles[f.key];
                const pb = scoutB.percentiles[f.key];
                return (
                  <div key={f.key} className="rule-thin grid grid-cols-[5.5rem_1fr_9rem_1fr_5.5rem] items-center gap-2 px-4 py-2">
                    <span className="font-stat text-sm font-semibold tabular-nums">
                      {va ?? "—"}
                      {va != null ? f.suffix ?? "" : ""}
                    </span>
                    <MirrorBar pct={pa} right={false} />
                    <span className="text-center text-[12px] font-medium text-graphite">{f.label}</span>
                    <MirrorBar pct={pb} right />
                    <span className="text-right font-stat text-sm font-semibold tabular-nums">
                      {vb ?? "—"}
                      {vb != null ? f.suffix ?? "" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-graphite">
              Bars extend toward the better national percentile. Turnover rate bars show ball security (longer = fewer turnovers).
            </p>
          </section>

          {/* head-to-head + common opponents */}
          {(headToHead.length || common.length) ? (
            <section className="rise rise-4 print-block">
              <SectionTitle kicker="Shared resume" title="Head-to-head & common opponents" />
              {headToHead.length ? (
                <div className="mt-3 space-y-2">
                  {headToHead.map((g) => (
                    <div key={g.gameId} className="flex items-center gap-3 rounded-md border-l-2 border-brass bg-white px-4 py-3 shadow-panel">
                      <span className="font-stat text-[11px] text-graphite">{g.date}</span>
                      <span className="text-sm font-medium">
                        {scoutA.identity.shortName} {g.result === "W" ? "beat" : "lost to"} {scoutB.identity.shortName}{" "}
                        <b className="font-stat">{g.score}</b>
                      </span>
                      <span className="font-stat text-[11px] uppercase text-graphite">
                        {g.venueTag === "home" ? `at ${scoutA.identity.abbrev}` : g.venueTag === "away" ? `at ${scoutB.identity.abbrev}` : "neutral"}
                      </span>
                      {g.note ? <span className="ml-auto font-stat text-[10px] text-brass">{g.note}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {common.length ? (
                <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white shadow-panel">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center bg-paper px-4 py-2.5">
                    <span className="font-stat text-[11px] font-semibold">{scoutA.identity.abbrev}</span>
                    <span className="font-stat text-[10px] uppercase tracking-widest text-graphite">
                      {common.length} common opponents
                    </span>
                    <span className="justify-self-end font-stat text-[11px] font-semibold">{scoutB.identity.abbrev}</span>
                  </div>
                  {common.map((c) => (
                    <div key={c.opponentId} className="rule-thin grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2">
                      <span className="font-stat text-[12.5px]">
                        {c.aGames.map((g) => `${g.result} ${g.score}`).join(" · ")}
                        <span className={`ml-2 text-[11px] ${c.aNet > c.bNet ? "font-bold text-make" : "text-graphite"}`}>
                          ({c.aNet > 0 ? "+" : ""}{c.aNet})
                        </span>
                      </span>
                      <span className="inline-flex items-center justify-center gap-1.5 text-[12.5px] font-medium">
                        {c.opponentLogo ? <img src={c.opponentLogo} alt="" width={16} height={16} loading="lazy" /> : null}
                        {c.opponent}
                        <TierBadge rank={c.oppSrsRank} />
                      </span>
                      <span className="justify-self-end font-stat text-[12.5px]">
                        <span className={`mr-2 text-[11px] ${c.bNet > c.aNet ? "font-bold text-make" : "text-graphite"}`}>
                          ({c.bNet > 0 ? "+" : ""}{c.bNet})
                        </span>
                        {c.bGames.map((g) => `${g.result} ${g.score}`).join(" · ")}
                      </span>
                    </div>
                  ))}
                  <div className="bg-paper px-4 py-2 text-center font-stat text-[11px] text-graphite">
                    Net vs common opponents: {scoutA.identity.abbrev}{" "}
                    <b className="text-ink">
                      {common.reduce((s, c) => s + c.aNet, 0) > 0 ? "+" : ""}
                      {common.reduce((s, c) => s + c.aNet, 0)}
                    </b>{" "}
                    · {scoutB.identity.abbrev}{" "}
                    <b className="text-ink">
                      {common.reduce((s, c) => s + c.bNet, 0) > 0 ? "+" : ""}
                      {common.reduce((s, c) => s + c.bNet, 0)}
                    </b>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* personnel watchlist */}
          <section className="rise rise-5 print-block grid gap-6 md:grid-cols-2">
            {[scoutA, scoutB].map((s) => (
              <div key={s.identity.id}>
                <SectionTitle kicker="Watchlist" title={`${s.identity.shortName} personnel`} />
                <div className="mt-3 space-y-2">
                  {s.keyPlayers.slice(0, 4).map((kp) => (
                    <div key={kp.id} className="flex items-baseline gap-3 rounded-md border border-line bg-white px-4 py-2.5 shadow-panel">
                      <span className="font-stat text-[11px] text-graphite">#{kp.jersey ?? "—"}</span>
                      <span className="text-sm font-semibold">{kp.name}</span>
                      <span className="font-stat text-[11px] text-graphite">{kp.position}</span>
                      <span className="ml-auto font-stat text-[12px]">
                        {[kp.ppg != null ? `${kp.ppg}p` : null, kp.rpg != null ? `${kp.rpg}r` : null, kp.apg != null ? `${kp.apg}a` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function TeamSide({ scout, score, winProb, right }: { scout: ScoutReport; score: number; winProb: number; right: boolean }) {
  const accent = `#${scout.identity.color ?? "567a62"}`;
  return (
    <div className={`relative flex items-center gap-5 px-6 py-8 ${right ? "flex-row-reverse text-right" : ""}`}>
      <div className="pointer-events-none absolute inset-0 opacity-25" style={{ background: `linear-gradient(${right ? "270deg" : "90deg"}, ${accent}, transparent 70%)` }} />
      <div className="relative">
        {scout.identity.logo ? <img src={scout.identity.logo} alt="" width={64} height={64} /> : null}
      </div>
      <div className="relative">
        <div className="font-stat text-[11px] text-white/60">
          {scout.identity.record} · No. {scout.identity.srsRank}
        </div>
        <div className="font-display text-2xl font-semibold leading-tight">{scout.identity.shortName}</div>
        <div className="font-display text-5xl font-black text-brass">{score}</div>
        <div className="font-stat text-[11px] text-white/60">{Math.round(winProb * 100)}% win probability</div>
      </div>
    </div>
  );
}

function MirrorBar({ pct, right }: { pct: number | undefined; right: boolean }) {
  return (
    <div className={`relative h-[9px] overflow-hidden rounded-sm bg-line/50 ${right ? "" : "scale-x-[-1]"}`}>
      <div className="bar-sweep absolute inset-y-0 left-0 rounded-sm" style={{ width: `${pct ?? 0}%`, background: pctColor(pct) }} />
    </div>
  );
}

function EmptyState({ teams, onPick }: { teams: TeamIndexEntry[]; onPick: (a: number, b: number) => void }) {
  const marquee: [string, string][] = [
    ["Michigan", "UConn"],
    ["Duke", "Arizona"],
    ["Houston", "Florida"],
    ["Purdue", "Illinois"],
  ];
  const byName = new Map(teams.map((t) => [t.shortName, t]));
  return (
    <section className="rise rise-2 rounded-lg border border-dashed border-line bg-white/60 p-10 text-center">
      <div className="font-display text-xl font-semibold">Choose two teams to open the war room</div>
      <p className="mx-auto mt-2 max-w-md text-sm text-graphite">
        Or start from a marquee matchup from the {teams.length ? "2025-26" : ""} season:
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {marquee.map(([x, y]) => {
          const tx = byName.get(x);
          const ty = byName.get(y);
          if (!tx || !ty) return null;
          return (
            <button
              key={`${x}${y}`}
              type="button"
              onClick={() => onPick(tx.id, ty.id)}
              className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium shadow-panel transition hover:-translate-y-0.5 hover:border-court"
            >
              <TeamMark team={tx} size={20} withName={false} /> {x}
              <span className="font-display italic text-brass">vs</span>
              <TeamMark team={ty} size={20} withName={false} /> {y}
            </button>
          );
        })}
      </div>
    </section>
  );
}
