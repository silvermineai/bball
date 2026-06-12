import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ShieldAlert, Swords } from "lucide-react";
import { PercentileBar, SectionTitle, StatBlock, TeamMark, TierBadge } from "@/components/Annual";
import { insights, ordinal } from "@/lib/insights";

export const Route = createFileRoute("/scout/$teamId")({
  component: ScoutPage,
});

const CLASS_ORDER = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"];

function ScoutPage() {
  const { teamId } = Route.useParams();
  const { data: scout, isLoading } = useQuery({
    queryKey: ["insights", "scout", teamId],
    queryFn: () => insights.scout(teamId),
    staleTime: Infinity,
  });

  if (isLoading) return <div className="py-20 text-center font-stat text-sm text-graphite">Pulling the dossier…</div>;
  if (!scout) return <div className="py-20 text-center text-graphite">No dossier found for this team.</div>;

  const { identity: id, metrics: m, percentiles: p, ranks: r, narratives, keyPlayers, roster, rosterInfo, schedule } = scout;
  const accent = id.color ? `#${id.color}` : "#17211b";

  return (
    <div className="space-y-10">
      {/* identity band */}
      <section
        className="rise rise-1 relative overflow-hidden rounded-lg px-6 py-8 text-white sm:px-10 grain"
        style={{ background: `linear-gradient(120deg, ${accent} 0%, #17211b 90%)` }}
      >
        <div className="pointer-events-none absolute -bottom-16 -right-4 select-none font-display text-[12rem] font-black leading-none text-white/10">
          {id.abbrev}
        </div>
        <div className="relative flex flex-wrap items-center gap-6">
          {id.logo ? <img src={id.logo} alt="" width={84} height={84} className="drop-shadow" /> : null}
          <div>
            <div className="font-stat text-[11px] uppercase tracking-[0.25em] text-white/70">
              Scouting dossier · {id.conference ?? "Division I"}
            </div>
            <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">{id.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 font-stat text-[13px] text-white/85">
              <span>{id.record} overall</span>
              {id.confRecord ? <span>{id.confRecord} conference</span> : null}
              {id.apRank ? <span>AP No. {id.apRank}</span> : null}
              <span>Power rating No. {id.srsRank}</span>
              <span>Last 10: {scout.last10Record}</span>
            </div>
          </div>
          <div className="ml-auto hidden gap-8 lg:flex">
            <HeaderStat label="Off. Eff" value={m.offEff} rank={r.offEff} />
            <HeaderStat label="Def. Eff" value={m.defEff} rank={r.defEff} />
            <HeaderStat label="Pace" value={m.pace} rank={r.pace} />
            <HeaderStat label="SRS" value={m.srs != null && m.srs > 0 ? `+${m.srs}` : m.srs} rank={r.srs} />
          </div>
        </div>
      </section>

      {/* plan + profile */}
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <section className="rise rise-2 space-y-8">
          <div>
            <SectionTitle kicker="The Plan" title="How to beat them" />
            <ol className="mt-4 space-y-3">
              {narratives.howToBeat.map((item, i) => (
                <li key={i} className="flex gap-4 rounded-lg border border-line bg-white p-4 shadow-panel">
                  <span className="ghost-numeral text-4xl">{i + 1}</span>
                  <span className="pt-1 text-sm leading-relaxed">{item}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <SectionTitle kicker="Respect" title="Strengths" right={<CheckCircle2 size={18} className="text-make" />} />
              <ul className="mt-3 space-y-2">
                {narratives.strengths.length ? (
                  narratives.strengths.map((s, i) => (
                    <li key={i} className="rounded-md border-l-2 border-make bg-white p-3 text-[13px] leading-relaxed shadow-panel">
                      {s.text}
                      <span className="ml-1.5 font-stat text-[10px] text-graphite">({s.pct}th pct)</span>
                    </li>
                  ))
                ) : (
                  <li className="text-[13px] text-graphite">No elite statistical traits — beatable across the board.</li>
                )}
              </ul>
            </div>
            <div>
              <SectionTitle kicker="Attack" title="Weaknesses" right={<ShieldAlert size={18} className="text-miss" />} />
              <ul className="mt-3 space-y-2">
                {narratives.weaknesses.length ? (
                  narratives.weaknesses.map((s, i) => (
                    <li key={i} className="rounded-md border-l-2 border-miss bg-white p-3 text-[13px] leading-relaxed shadow-panel">
                      {s.text}
                      <span className="ml-1.5 font-stat text-[10px] text-graphite">({s.pct}th pct)</span>
                    </li>
                  ))
                ) : (
                  <li className="text-[13px] text-graphite">No glaring statistical holes — they make you earn it.</li>
                )}
              </ul>
            </div>
          </div>

          <div>
            <SectionTitle kicker="Personnel" title="Players to game-plan for" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {keyPlayers.slice(0, 6).map((kp) => (
                <div key={kp.id} className="rounded-lg border border-line bg-white p-4 shadow-panel">
                  <div className="flex items-baseline justify-between">
                    <div className="font-display text-lg font-semibold">{kp.name}</div>
                    <span className="font-stat text-[11px] text-graphite">#{kp.jersey ?? "—"}</span>
                  </div>
                  <div className="font-stat text-[11px] text-graphite">
                    {[kp.position, kp.classYear, kp.height].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-stat text-[12px]">
                    {kp.ppg != null ? <span><b>{kp.ppg}</b> pts</span> : null}
                    {kp.rpg != null ? <span><b>{kp.rpg}</b> reb</span> : null}
                    {kp.apg != null ? <span><b>{kp.apg}</b> ast</span> : null}
                    {kp.threesPg != null ? <span><b>{kp.threesPg}</b> 3PM</span> : null}
                    {kp.spg != null ? <span><b>{kp.spg}</b> stl</span> : null}
                    {kp.bpg != null ? <span><b>{kp.bpg}</b> blk</span> : null}
                    {kp.per != null ? <span><b>{kp.per}</b> PER</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rise rise-3 space-y-8">
          <div>
            <SectionTitle kicker="Statistical identity" title="Profile vs. the nation" />
            <p className="mt-1 text-[12px] text-graphite">Bars show national percentile. Midline = D-I median.</p>
            <div className="mt-3 rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="font-stat text-[10px] uppercase tracking-[0.2em] text-court">Offense</div>
              <PercentileBar label="Off. efficiency" value={m.offEff} pct={p.offEff} rank={r.offEff} />
              <PercentileBar label="eFG%" value={m.efg} pct={p.efg} rank={r.efg} suffix="%" />
              <PercentileBar label="3P%" value={m.threePct} pct={p.threePct} rank={r.threePct} suffix="%" />
              <PercentileBar label="Ball security" value={m.tovPct} pct={p.tovPct} rank={r.tovPct} suffix="% TO" />
              <PercentileBar label="Off. rebounding" value={m.orbPct} pct={p.orbPct} rank={r.orbPct} suffix="%" />
              <PercentileBar label="FT rate" value={m.ftRate} pct={p.ftRate} rank={r.ftRate} />
              <PercentileBar label="Ball movement" value={m.astRate} pct={p.astRate} rank={r.astRate} suffix="%" />
              <div className="mt-3 font-stat text-[10px] uppercase tracking-[0.2em] text-court">Defense & tempo</div>
              <PercentileBar label="Def. efficiency" value={m.defEff} pct={p.defEff} rank={r.defEff} />
              <PercentileBar label="Steals / game" value={m.stealsPerGame} pct={p.stealsPerGame} rank={r.stealsPerGame} />
              <PercentileBar label="Blocks / game" value={m.blocksPerGame} pct={p.blocksPerGame} rank={r.blocksPerGame} />
              <PercentileBar label="Pace" value={m.pace} pct={p.pace} rank={r.pace} />
            </div>
          </div>

          <div>
            <SectionTitle kicker="Where points come from" title="Scoring DNA" />
            <div className="mt-3 grid grid-cols-3 gap-4 rounded-lg border border-line bg-white p-4 shadow-panel">
              <StatBlock label="From threes" value={`${m.ptsFrom3Pct ?? "—"}%`} />
              <StatBlock label="Fast break / g" value={m.fastBreakPerGame ?? "—"} />
              <StatBlock label="2nd chance / g" value={m.secondChancePerGame ?? "—"} />
              <StatBlock label="From the line" value={`${m.ptsFromFtPct ?? "—"}%`} />
              <StatBlock label="Off turnovers / g" value={m.ptsOffTovPerGame ?? "—"} />
              <StatBlock label="A/TO ratio" value={m.astToRatio ?? "—"} />
            </div>
          </div>

          <div>
            <SectionTitle kicker="Roster construction" title="The room" />
            <div className="mt-3 rounded-lg border border-line bg-white p-4 shadow-panel">
              <div className="flex h-4 overflow-hidden rounded-sm">
                {CLASS_ORDER.filter((c) => rosterInfo.classBreakdown[c]).map((c, i) => (
                  <div
                    key={c}
                    title={`${c}: ${rosterInfo.classBreakdown[c]}`}
                    style={{
                      width: `${(100 * (rosterInfo.classBreakdown[c] ?? 0)) / rosterInfo.rosterSize}%`,
                      background: ["#9fb8a8", "#769b84", "#567a62", "#c0843e", "#8a5a28"][i],
                    }}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-stat text-[11px] text-graphite">
                {CLASS_ORDER.filter((c) => rosterInfo.classBreakdown[c]).map((c) => (
                  <span key={c}>
                    {c} <b>{rosterInfo.classBreakdown[c]}</b>
                  </span>
                ))}
              </div>
              {rosterInfo.departingCount ? (
                <p className="mt-3 text-[13px] leading-relaxed">
                  <b>{rosterInfo.departingCount}</b> seniors/grads depart ({rosterInfo.departingShare}% of the roster)
                  {rosterInfo.positionalNeeds.length ? (
                    <>
                      {" "}
                      — biggest needs at <b>{rosterInfo.positionalNeeds.join(", ")}</b>
                    </>
                  ) : null}
                  .
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {/* resume + schedule */}
      <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
        <section className="rise rise-4">
          <SectionTitle kicker="The Resume" title="Quality wins & blemishes" right={<Swords size={18} className="text-brass" />} />
          <div className="mt-3 space-y-2">
            {scout.qualityWins.map((g) => (
              <ResultRow key={`qw${g.gameId}`} g={g} good />
            ))}
            {scout.badLosses.map((g) => (
              <ResultRow key={`bl${g.gameId}`} g={g} />
            ))}
            {!scout.qualityWins.length && !scout.badLosses.length ? (
              <p className="text-[13px] text-graphite">No top-50 wins or sub-150 losses on the ledger.</p>
            ) : null}
            {id.vsApRecord && id.vsApRecord !== "0-0" ? (
              <p className="pt-2 font-stat text-[12px] text-graphite">
                vs. AP Top 25: <b className="text-ink">{id.vsApRecord}</b>
              </p>
            ) : null}
          </div>

          <div className="mt-8">
            <SectionTitle kicker="Full roster" title={`${roster.length} players`} />
            <div className="mt-3 overflow-hidden rounded-lg border border-line bg-white shadow-panel">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-paper font-stat text-[10px] uppercase tracking-wider text-graphite">
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Player</th>
                    <th className="px-3 py-2 text-left">Pos</th>
                    <th className="px-3 py-2 text-left">Class</th>
                    <th className="px-3 py-2 text-left">Ht</th>
                    <th className="hidden px-3 py-2 text-left sm:table-cell">Hometown</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((pl) => (
                    <tr key={pl.id} className="rule-thin">
                      <td className="px-3 py-1.5 font-stat text-graphite">{pl.jersey ?? "—"}</td>
                      <td className="px-3 py-1.5 font-medium">{pl.name}</td>
                      <td className="px-3 py-1.5">{pl.position ?? "—"}</td>
                      <td className="px-3 py-1.5">{pl.classYear ?? "—"}</td>
                      <td className="px-3 py-1.5 font-stat">{pl.height ?? "—"}</td>
                      <td className="hidden px-3 py-1.5 text-graphite sm:table-cell">{pl.hometown ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rise rise-5">
          <SectionTitle kicker="Game log" title={`All ${schedule.length} games`} />
          <div className="mt-3 overflow-hidden rounded-lg border border-line bg-white shadow-panel">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-paper font-stat text-[10px] uppercase tracking-wider text-graphite">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Opponent</th>
                  <th className="px-3 py-2 text-center">Tier</th>
                  <th className="px-3 py-2 text-center">Site</th>
                  <th className="px-3 py-2 text-right">Result</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((g) => (
                  <tr key={g.gameId} className="rule-thin">
                    <td className="px-3 py-1.5 font-stat text-graphite">{g.date.slice(5)}</td>
                    <td className="px-3 py-1.5">
                      {g.opponentId ? (
                        <Link
                          to="/scout/$teamId"
                          params={{ teamId: String(g.opponentId) }}
                          className="inline-flex items-center gap-1.5 font-medium hover:text-court"
                        >
                          {g.opponentLogo ? <img src={g.opponentLogo} alt="" width={16} height={16} loading="lazy" /> : null}
                          {g.opponent}
                        </Link>
                      ) : (
                        g.opponent
                      )}
                      {g.note ? <span className="ml-2 font-stat text-[10px] text-brass">{g.note}</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <TierBadge rank={g.oppSrsRank} />
                    </td>
                    <td className="px-3 py-1.5 text-center font-stat text-[11px] uppercase text-graphite">
                      {g.venueTag === "home" ? "vs" : g.venueTag === "away" ? "at" : "N"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-stat">
                      <span className={`font-semibold ${g.result === "W" ? "text-make" : "text-miss"}`}>{g.result}</span>{" "}
                      {g.score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* footer links */}
      <div className="no-print flex flex-wrap gap-3 border-t-2 border-ink pt-4">
        <Link
          to="/gameplan"
          search={{ a: Number(teamId) }}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-graphite"
        >
          Build a game plan vs. {id.shortName} →
        </Link>
        <Link
          to="/pressroom"
          search={{ team: Number(teamId) }}
          className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium transition hover:border-court"
        >
          Press kit for {id.shortName}
        </Link>
      </div>
    </div>
  );
}

function HeaderStat({ label, value, rank }: { label: string; value: number | string | null | undefined; rank?: number }) {
  return (
    <div className="text-right">
      <div className="font-stat text-[10px] uppercase tracking-[0.2em] text-white/60">{label}</div>
      <div className="font-display text-3xl font-semibold">{value ?? "—"}</div>
      {rank != null ? <div className="font-stat text-[11px] text-white/60">{ordinal(rank)} in D-I</div> : null}
    </div>
  );
}

function ResultRow({ g, good }: { g: import("@/lib/insights").ScheduleGame; good?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-md border-l-2 bg-white p-3 shadow-panel ${good ? "border-make" : "border-miss"}`}>
      <span className={`font-stat text-sm font-bold ${good ? "text-make" : "text-miss"}`}>{g.result}</span>
      <span className="text-[13px] font-medium">
        {g.venueTag === "home" ? "vs" : g.venueTag === "away" ? "at" : "vs"} {g.opponent}
      </span>
      <TierBadge rank={g.oppSrsRank} />
      <span className="ml-auto font-stat text-[12px] text-graphite">{g.score}</span>
      <span className="font-stat text-[11px] text-graphite">{g.date.slice(5)}</span>
    </div>
  );
}
