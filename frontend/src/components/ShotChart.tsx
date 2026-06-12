import type { Shot } from "@/types";
import { useState, type MouseEvent } from "react";

type CourtView = "full" | "split-half";

type Tooltip = {
  left: number;
  top: number;
  shot: Shot;
  team: string;
};

type ChartShot = {
  shot: Shot;
  x: number;
  y: number;
  team: string;
  color?: string;
};

export function ShotChart({
  shots,
  title = "Shot Map",
  colorByTeam = false,
  courtView = "full",
  homeTeam,
  awayTeam,
}: {
  shots: Shot[];
  title?: string;
  colorByTeam?: boolean;
  courtView?: CourtView;
  homeTeam?: string;
  awayTeam?: string;
}) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const made = shots.filter((shot) => Boolean(shot.made)).length;
  const attempts = shots.length;
  const feetToPx = 10;
  const ft = (value: number) => value * feetToPx;
  const inch = (value: number) => (value / 12) * feetToPx;
  const courtWidthPx = 940;
  const courtHeightPx = 500;
  const laneTopPx = 190;
  const laneBottomPx = 310;
  const hoopOffsetPx = inch(63);
  const mensThreeRadiusPx = ft(22) + inch(1.75);
  const cornerThreeOffsetPx = inch(51);
  const restrictedArcRadiusPx = ft(4);
  const cornerThreeBottomPx = courtHeightPx - cornerThreeOffsetPx;
  const cornerThreeArcX = hoopOffsetPx + Math.sqrt(mensThreeRadiusPx ** 2 - (courtHeightPx / 2 - cornerThreeOffsetPx) ** 2);
  const rightCornerThreeArcX = courtWidthPx - cornerThreeArcX;
  const leftThreePath = `M 0 ${cornerThreeOffsetPx} L ${cornerThreeArcX} ${cornerThreeOffsetPx} A ${mensThreeRadiusPx} ${mensThreeRadiusPx} 0 0 1 ${cornerThreeArcX} ${cornerThreeBottomPx} L 0 ${cornerThreeBottomPx}`;
  const rightThreePath = `M ${courtWidthPx} ${cornerThreeOffsetPx} L ${rightCornerThreeArcX} ${cornerThreeOffsetPx} A ${mensThreeRadiusPx} ${mensThreeRadiusPx} 0 0 0 ${rightCornerThreeArcX} ${cornerThreeBottomPx} L ${courtWidthPx} ${cornerThreeBottomPx}`;
  const coachBoxTopFromBaselinePx = ft(28);
  const coachBoxTickInsetPx = 14;
  const coachBoxTicks = [coachBoxTopFromBaselinePx, courtWidthPx - coachBoxTopFromBaselinePx];
  const laneMarkDepthPx = inch(8);
  const laneMarksFromBaseline = [
    { start: ft(7), width: ft(1), kind: "block" },
    { start: ft(11), width: inch(2), kind: "tick" },
    { start: ft(14) + inch(2), width: inch(2), kind: "tick" },
  ];
  const laneMarks = laneMarksFromBaseline.flatMap((mark) => {
    const rightX = courtWidthPx - mark.start - mark.width;
    return [
      { ...mark, x: mark.start, y: laneTopPx - laneMarkDepthPx, base: "bottom" as const },
      { ...mark, x: mark.start, y: laneBottomPx, base: "top" as const },
      { ...mark, x: rightX, y: laneTopPx - laneMarkDepthPx, base: "bottom" as const },
      { ...mark, x: rightX, y: laneBottomPx, base: "top" as const },
    ];
  });
  const point = (shot: Shot) => ({
    x: shot.x <= 100 ? shot.x * 9.4 : shot.x,
    y: shot.y <= 100 ? shot.y * 5 : shot.y,
  });
  const displayPoint = (shot: Shot) => {
    const raw = point(shot);
    return raw;
  };
  const halfCourtPoint = (shot: Shot) => {
    const raw = point(shot);
    const halfX = raw.x <= courtWidthPx / 2 ? raw.x : courtWidthPx - raw.x;
    return {
      x: raw.y,
      y: halfX,
    };
  };
  const teamColor = (team: string) => {
    const side = teamSide(team, homeTeam, awayTeam);
    if (side === "home") return "#1f8a62";
    if (side === "away") return "#315f9d";
    return "#6f7d72";
  };
  const chartShots: ChartShot[] = shots.map((shot) => {
    const team = resolveTeam(shot);
    const { x, y } = courtView === "split-half" ? halfCourtPoint(shot) : displayPoint(shot);
    return { shot, team, x, y, color: colorByTeam ? teamColor(team) : undefined };
  });

  return (
    <section className="relative min-w-0 rounded-md border border-line bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-graphite">{attempts ? `${made}/${attempts} makes shown` : "No shots in this filter"}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-graphite">
          {colorByTeam ? (
            <>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-make" /> {homeTeam ?? "Home"}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#315f9d]" /> {awayTeam ?? "Away"}</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-make" /> Make</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border-2 border-miss" /> Miss</span>
            </>
          )}
        </div>
      </div>
      {courtView === "split-half" ? (
        <HalfCourtSvg shots={chartShots} onTooltip={setTooltip} />
      ) : (
        <FullCourtSvg
          chartShots={chartShots}
          coachBoxTickInsetPx={coachBoxTickInsetPx}
          coachBoxTicks={coachBoxTicks}
          cornerThreeOffsetPx={cornerThreeOffsetPx}
          courtHeightPx={courtHeightPx}
          laneBottomPx={laneBottomPx}
          laneMarkDepthPx={laneMarkDepthPx}
          laneMarks={laneMarks}
          laneTopPx={laneTopPx}
          leftThreePath={leftThreePath}
          onTooltip={setTooltip}
          restrictedArcRadiusPx={restrictedArcRadiusPx}
          rightThreePath={rightThreePath}
        />
      )}
      {tooltip ? <ShotTooltip tooltip={tooltip} /> : null}
    </section>
  );
}

function FullCourtSvg({
  chartShots,
  coachBoxTickInsetPx,
  coachBoxTicks,
  courtHeightPx,
  laneBottomPx,
  laneMarkDepthPx,
  laneMarks,
  laneTopPx,
  leftThreePath,
  onTooltip,
  restrictedArcRadiusPx,
  rightThreePath,
}: {
  chartShots: ChartShot[];
  coachBoxTickInsetPx: number;
  coachBoxTicks: number[];
  cornerThreeOffsetPx: number;
  courtHeightPx: number;
  laneBottomPx: number;
  laneMarkDepthPx: number;
  laneMarks: Array<{ x: number; y: number; width: number; kind: string; base: "top" | "bottom" }>;
  laneTopPx: number;
  leftThreePath: string;
  onTooltip: (tooltip: Tooltip | null) => void;
  restrictedArcRadiusPx: number;
  rightThreePath: string;
}) {
  return (
    <svg viewBox="0 0 940 500" className="court-grid aspect-[940/500] w-full rounded-md border border-line bg-[#fbfbf6]">
      <rect x="0" y="0" width="940" height="500" fill="none" stroke="#9aa49a" strokeWidth="3" />
      <line x1="470" y1="0" x2="470" y2="500" stroke="#9aa49a" strokeWidth="3" />
      <circle cx="470" cy="250" r="60" fill="none" stroke="#9aa49a" strokeWidth="3" />
      <rect x="0" y={laneTopPx} width="190" height="120" fill="none" stroke="#9aa49a" strokeWidth="3" />
      <rect x="750" y={laneTopPx} width="190" height="120" fill="none" stroke="#9aa49a" strokeWidth="3" />
      {laneMarks.map((mark) => (
        <g key={`${mark.x}-${mark.y}-${mark.kind}`}>
          <rect x={mark.x} y={mark.y} width={mark.width} height={laneMarkDepthPx} fill="#6f7d72" fillOpacity={mark.kind === "block" ? 0.62 : 0.5} stroke="#9aa49a" strokeWidth="0.75" />
          <line
            x1={mark.x}
            y1={mark.base === "top" ? mark.y : mark.y + laneMarkDepthPx}
            x2={mark.x + mark.width}
            y2={mark.base === "top" ? mark.y : mark.y + laneMarkDepthPx}
            stroke="#6f7d72"
            strokeWidth={mark.kind === "block" ? 3 : 1.5}
          />
        </g>
      ))}
      <path d="M 190 190 A 60 60 0 0 1 190 310" fill="none" stroke="#9aa49a" strokeWidth="3" />
      <path d="M 190 310 A 60 60 0 0 1 190 190" fill="none" stroke="#9aa49a" strokeWidth="2" strokeDasharray="8 8" opacity="0.8" />
      <path d="M 750 190 A 60 60 0 0 0 750 310" fill="none" stroke="#9aa49a" strokeWidth="3" />
      <path d="M 750 310 A 60 60 0 0 0 750 190" fill="none" stroke="#9aa49a" strokeWidth="2" strokeDasharray="8 8" opacity="0.8" />
      <path d={leftThreePath} fill="none" stroke="#9aa49a" strokeWidth="3" />
      <path d={rightThreePath} fill="none" stroke="#9aa49a" strokeWidth="3" />
      <line x1="0" y1="250" x2="940" y2="250" stroke="#6f7d72" strokeWidth="2" strokeDasharray="6 10" opacity="0.22" />
      <line x1="40" y1="0" x2="40" y2="500" stroke="#6f7d72" strokeWidth="2" strokeDasharray="4 10" opacity="0.18" />
      <line x1="40" y1="220" x2="40" y2="280" stroke="#6f7d72" strokeWidth="4" strokeLinecap="round" />
      <line x1="40" y1="250" x2="52.5" y2="250" stroke="#6f7d72" strokeWidth="3" />
      <circle cx="52.5" cy="250" r="7.5" fill="none" stroke="#c0843e" strokeWidth="4" />
      <line x1="900" y1="0" x2="900" y2="500" stroke="#6f7d72" strokeWidth="2" strokeDasharray="4 10" opacity="0.18" />
      <line x1="900" y1="220" x2="900" y2="280" stroke="#6f7d72" strokeWidth="4" strokeLinecap="round" />
      <line x1="887.5" y1="250" x2="900" y2="250" stroke="#6f7d72" strokeWidth="3" />
      <circle cx="887.5" cy="250" r="7.5" fill="none" stroke="#c0843e" strokeWidth="4" />
      <path d={`M 52.5 ${250 - restrictedArcRadiusPx} A ${restrictedArcRadiusPx} ${restrictedArcRadiusPx} 0 0 1 52.5 ${250 + restrictedArcRadiusPx}`} fill="none" stroke="#6f7d72" strokeWidth="2" opacity="0.55" />
      <path d={`M 887.5 ${250 - restrictedArcRadiusPx} A ${restrictedArcRadiusPx} ${restrictedArcRadiusPx} 0 0 0 887.5 ${250 + restrictedArcRadiusPx}`} fill="none" stroke="#6f7d72" strokeWidth="2" opacity="0.55" />
      {coachBoxTicks.map((x) => (
        <line
          key={x}
          x1={x}
          y1={courtHeightPx}
          x2={x}
          y2={courtHeightPx - coachBoxTickInsetPx}
          stroke="#6f7d72"
          strokeWidth="3"
          opacity="0.34"
        />
      ))}
      <ShotMarks shots={chartShots} onTooltip={onTooltip} />
    </svg>
  );
}

function HalfCourtSvg({ shots, onTooltip }: { shots: ChartShot[]; onTooltip: (tooltip: Tooltip | null) => void }) {
  return (
    <svg viewBox="0 0 500 470" className="court-grid mx-auto aspect-[500/470] max-h-[560px] w-full max-w-[620px] rounded-md border border-line bg-[#fbfbf6]">
      <rect x="0" y="0" width="500" height="470" fill="none" stroke="#9aa49a" strokeWidth="3" />
      <rect x="190" y="0" width="120" height="190" fill="none" stroke="#9aa49a" strokeWidth="3" />
      <path d="M 190 190 A 60 60 0 0 0 310 190" fill="none" stroke="#9aa49a" strokeWidth="3" />
      <path d="M 310 190 A 60 60 0 0 0 190 190" fill="none" stroke="#9aa49a" strokeWidth="2" strokeDasharray="8 8" opacity="0.8" />
      <path d="M 42.5 0 L 42.5 129.9 A 221.46 221.46 0 0 0 457.5 129.9 L 457.5 0" fill="none" stroke="#9aa49a" strokeWidth="3" />
      <line x1="0" y1="40" x2="500" y2="40" stroke="#6f7d72" strokeWidth="2" strokeDasharray="4 10" opacity="0.18" />
      <line x1="220" y1="40" x2="280" y2="40" stroke="#6f7d72" strokeWidth="4" strokeLinecap="round" />
      <line x1="250" y1="40" x2="250" y2="52.5" stroke="#6f7d72" strokeWidth="3" />
      <circle cx="250" cy="52.5" r="7.5" fill="none" stroke="#c0843e" strokeWidth="4" />
      <path d="M 210 52.5 A 40 40 0 0 0 290 52.5" fill="none" stroke="#6f7d72" strokeWidth="2" opacity="0.55" />
      <line x1="250" y1="0" x2="250" y2="470" stroke="#6f7d72" strokeWidth="2" strokeDasharray="6 10" opacity="0.18" />
      <ShotMarks shots={shots} onTooltip={onTooltip} />
    </svg>
  );
}

function ShotMarks({ shots, onTooltip }: { shots: ChartShot[]; onTooltip: (tooltip: Tooltip | null) => void }) {
  return (
    <>
      {shots.map(({ shot, x, y, team, color }) => {
        const tooltipHandler = (event: MouseEvent<SVGGElement>) => {
          const bounds = event.currentTarget.closest("section")?.getBoundingClientRect();
          onTooltip({
            left: bounds ? event.clientX - bounds.left + 12 : event.clientX,
            top: bounds ? event.clientY - bounds.top + 12 : event.clientY,
            shot,
            team,
          });
        };
        return (
          <g
            key={`${shot.id}-${shot.contestId ?? ""}`}
            className="cursor-crosshair"
            onMouseEnter={tooltipHandler}
            onMouseMove={tooltipHandler}
            onMouseLeave={() => onTooltip(null)}
          >
            <title>{shot.description ?? shot.playerName ?? "Shot"}</title>
            {Boolean(shot.made) ? (
              <circle cx={x} cy={y} r={8} fill={color ?? "#1f8a62"} fillOpacity={Boolean(shot.isThree) ? 0.9 : 0.74} />
            ) : (
              <g stroke={color ?? "#c94d3f"} strokeWidth="5" strokeLinecap="round">
                <line x1={x - 9} y1={y - 9} x2={x + 9} y2={y + 9} />
                <line x1={x + 9} y1={y - 9} x2={x - 9} y2={y + 9} />
              </g>
            )}
          </g>
        );
      })}
    </>
  );
}

function ShotTooltip({ tooltip }: { tooltip: Tooltip }) {
  const { shot, team } = tooltip;
  const period = shot.period ? ordinal(shot.period) : "";
  const time = [period, shot.clock].filter(Boolean).join(" ");
  const points = Boolean(shot.isThree) ? 3 : (shot.shotValue ?? 2);
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-52 rounded-md border border-line bg-ink px-3 py-2 text-xs text-white shadow-panel"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      <div className="text-sm font-semibold">{shot.playerName ?? "Unknown shooter"}</div>
      <div className="mt-1 text-[#dce8de]">{team || "Unknown team"}</div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[#dce8de]">
        <span>Points</span>
        <span className="text-right font-semibold text-white">{points}</span>
        <span>Time</span>
        <span className="text-right font-semibold text-white">{time || "-"}</span>
        <span>Result</span>
        <span className="text-right font-semibold text-white">{Boolean(shot.made) ? "Made" : "Missed"}</span>
      </div>
    </div>
  );
}

function resolveTeam(shot: Shot) {
  if (shot.teamName) return shot.teamName;
  const match = shot.description?.match(/\(([^)]+)\)/);
  return match?.[1] ?? "";
}

function teamSide(team: string, homeTeam?: string, awayTeam?: string) {
  const normalized = normalize(team);
  if (!normalized) return undefined;
  if (homeTeam && normalize(homeTeam).includes(normalized)) return "home";
  if (awayTeam && normalize(awayTeam).includes(normalized)) return "away";
  if (homeTeam && normalized.includes(normalize(homeTeam).slice(0, 4))) return "home";
  if (awayTeam && normalized.includes(normalize(awayTeam).slice(0, 4))) return "away";
  return undefined;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function ordinal(value: number) {
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}
