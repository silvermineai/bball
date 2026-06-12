// Shared editorial primitives for the analytics pages ("The Coaching Annual").
import { Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ordinal, pctColor } from "@/lib/insights";
import type { TeamIndexEntry } from "@/lib/insights";

export function SectionTitle({ kicker, title, right }: { kicker?: string; title: string; right?: ReactNode }) {
  return (
    <div className="rule-top flex items-end justify-between gap-3 pt-2">
      <div>
        {kicker ? (
          <div className="font-stat text-[11px] uppercase tracking-[0.22em] text-court">{kicker}</div>
        ) : null}
        <h2 className="font-display text-2xl font-semibold leading-tight">{title}</h2>
      </div>
      {right ? <div className="pb-1">{right}</div> : null}
    </div>
  );
}

export function TeamMark({
  team,
  size = 28,
  withName = true,
  bold = false,
}: {
  team: { id?: number | null; shortName?: string | null; name?: string | null; logo?: string | null };
  size?: number;
  withName?: boolean;
  bold?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {team.logo ? (
        <img src={team.logo} alt="" width={size} height={size} className="shrink-0" loading="lazy" />
      ) : (
        <span
          className="grid shrink-0 place-items-center rounded-full bg-line font-stat text-[10px]"
          style={{ width: size, height: size }}
        >
          {(team.shortName ?? "?").slice(0, 2)}
        </span>
      )}
      {withName ? <span className={bold ? "font-semibold" : ""}>{team.shortName ?? team.name}</span> : null}
    </span>
  );
}

export function PercentileBar({
  label,
  value,
  pct,
  rank,
  suffix = "",
}: {
  label: string;
  value: number | null | undefined;
  pct: number | undefined;
  rank?: number;
  suffix?: string;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 py-1.5">
      <div className="text-[13px] font-medium text-graphite">{label}</div>
      <div className="relative h-[10px] overflow-hidden rounded-sm bg-line/60">
        <div
          className="bar-sweep absolute inset-y-0 left-0 rounded-sm"
          style={{ width: `${pct ?? 0}%`, background: pctColor(pct) }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px bg-ink/20" />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-stat text-sm font-semibold tabular-nums">
          {value ?? "—"}
          {value != null ? suffix : ""}
        </span>
        {rank != null ? <span className="font-stat text-[11px] text-graphite">{ordinal(rank)}</span> : null}
      </div>
    </div>
  );
}

export function TierBadge({ rank }: { rank: number | null | undefined }) {
  if (rank == null) return null;
  const tier = rank <= 50 ? "A" : rank <= 100 ? "B" : rank <= 200 ? "C" : "D";
  const tone =
    tier === "A" ? "bg-make text-white" : tier === "B" ? "bg-court text-white" : tier === "C" ? "bg-line text-graphite" : "bg-paper text-graphite border border-line";
  return (
    <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-stat text-[10px] font-semibold ${tone}`} title={`Opponent power-rating tier (No. ${rank})`}>
      {tier}
    </span>
  );
}

export function StatBlock({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: accent ? "#c0843e" : "#d8ddd7" }}>
      <div className="font-stat text-[10px] uppercase tracking-[0.18em] text-graphite">{label}</div>
      <div className="font-display text-2xl font-semibold leading-tight">{value}</div>
      {sub ? <div className="text-[12px] text-graphite">{sub}</div> : null}
    </div>
  );
}

export function TeamPicker({
  teams,
  value,
  onChange,
  placeholder = "Search any of 362 teams…",
}: {
  teams: TeamIndexEntry[];
  value: TeamIndexEntry | null;
  onChange: (team: TeamIndexEntry) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return teams.slice(0, 12);
    return teams
      .filter(
        (t) =>
          t.name.toLowerCase().includes(needle) ||
          (t.abbrev ?? "").toLowerCase().includes(needle) ||
          (t.conference ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 12);
  }, [teams, q]);

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2">
        {value ? <TeamMark team={value} size={22} withName={false} /> : null}
        <input
          className="w-full border-0 bg-transparent p-0 text-sm focus:ring-0"
          placeholder={value ? value.name : placeholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && matches.length > 0 ? (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-md border border-line bg-white shadow-panel">
          {matches.map((t) => (
            <button
              key={t.id}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-paper"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(t);
                setQ("");
                setOpen(false);
              }}
            >
              <TeamMark team={t} size={20} />
              <span className="font-stat text-[11px] text-graphite">
                {t.record ?? ""} · {t.conference ?? ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ScoutLink({ teamId, children }: { teamId: number; children: ReactNode }) {
  return (
    <Link to="/scout/$teamId" params={{ teamId: String(teamId) }} className="hover:text-court">
      {children}
    </Link>
  );
}
