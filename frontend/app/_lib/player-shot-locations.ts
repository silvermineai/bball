/**
 * NCAA shot coordinates are measured in feet from the basket: x=0 is the
 * lane centre, x=-25/+25 are the court edges, and y=0 is the basket. The
 * public chart draws the first half court while retaining every source row in
 * the attempt totals.
 */
export const PLAYER_COURT = {
  svgWidth: 500,
  svgHeight: 470,
  xMin: -25,
  xMax: 25,
  yMin: -5.25,
  yMax: 41.75,
  sourceYMax: 88.75,
  basketX: 0,
  basketY: 0,
  feetPerSvgUnit: 0.1,
} as const;

/**
 * Structural shot input shared by the app's recorded shot feeds. Keeping
 * fields outside the coordinate pair optional lets a player card pass either
 * detailed event rows or a lighter NCAA coordinate export without coercing
 * missing evidence into made/missed values.
 */
export type PlayerShotLocation = {
  id: string | number;
  x: number | null;
  y: number | null;
  made?: boolean | number | null;
  points?: number | null;
  game?: string | number | null;
  player?: string | number | null;
  period?: number | null;
  clock?: string | null;
  type?: string | null;
  location_status?: string | null;
  text?: string | null;
};

export type CourtPoint = {
  x: number;
  y: number;
};

export type CourtLocationStatus =
  | "plotted"
  | "beyond_half_court"
  | "missing";

export type PlayerCourtZone = {
  key: string;
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  attempts: number;
  makes: number;
  makeRate: number | null;
  share: number;
};

export type PlayerShotBand = "Rim" | "Paint" | "Midrange" | "3-point";
export type PlayerShotSide = "Chart left" | "Middle" | "Chart right";

const PLAYER_COURT_LANE_EDGE_FT = 8;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** The NCAA feed uses both basket-origin pairs as placeholders for unknown locations. */
const isPlaceholderCourtCoordinate = (x: number, y: number) =>
  (x === 0 && y === 0) || (x === 25 && y === 0);

/** True when the shot has source coordinates inside the published chart bounds. */
export function hasSourceCourtCoordinates(shot: Pick<PlayerShotLocation, "x" | "y" | "location_status">) {
  if (
    !isFiniteNumber(shot.x) ||
    !isFiniteNumber(shot.y) ||
    shot.x < PLAYER_COURT.xMin ||
    shot.x > PLAYER_COURT.xMax ||
    shot.y < PLAYER_COURT.yMin ||
    shot.y > PLAYER_COURT.sourceYMax
  ) {
    return false;
  }
  if (isPlaceholderCourtCoordinate(shot.x, shot.y)) return false;
  const status = shot.location_status?.trim();
  return !status || status === "located";
}

/** True when the point can be drawn in the half-court profile. */
export function isPlottablePlayerShot(shot: Pick<PlayerShotLocation, "x" | "y" | "location_status">) {
  return hasSourceCourtCoordinates(shot) && shot.y! <= PLAYER_COURT.yMax;
}

/** Keep unavailable coordinates out of the visualization while retaining them in totals. */
export function classifyPlayerShotLocation(
  shot: Pick<PlayerShotLocation, "x" | "y" | "location_status">,
): CourtLocationStatus {
  if (!hasSourceCourtCoordinates(shot)) return "missing";
  return shot.y! <= PLAYER_COURT.yMax ? "plotted" : "beyond_half_court";
}

/** Convert source feet to the SVG viewBox used by the player court. */
export function toPlayerCourtPoint(
  shot: Pick<PlayerShotLocation, "x" | "y">,
): CourtPoint | null {
  if (!isFiniteNumber(shot.x) || !isFiniteNumber(shot.y)) return null;
  return {
    x: (shot.x - PLAYER_COURT.xMin) * 10,
    y: (shot.y - PLAYER_COURT.yMin) * 10,
  };
}

/**
 * Assign a shot to a small geometric band for the summary below the map.
 * These are display bins derived from coordinates, not source event labels.
 */
export function playerShotBand(
  shot: Pick<PlayerShotLocation, "x" | "y">,
): PlayerShotBand | null {
  if (!isFiniteNumber(shot.x) || !isFiniteNumber(shot.y)) return null;
  const distance = Math.hypot(shot.x - PLAYER_COURT.basketX, shot.y);
  if (distance <= 4) return "Rim";
  if (distance <= 12) return "Paint";
  if (distance >= 22.15) return "3-point";
  return "Midrange";
}

export function summarizePlayerShotBands(shots: readonly PlayerShotLocation[]) {
  const bands: Array<{ band: PlayerShotBand; attempts: number; makes: number; share: number; makeRate: number | null }> = [
    { band: "Rim", attempts: 0, makes: 0, share: 0, makeRate: null },
    { band: "Paint", attempts: 0, makes: 0, share: 0, makeRate: null },
    { band: "Midrange", attempts: 0, makes: 0, share: 0, makeRate: null },
    { band: "3-point", attempts: 0, makes: 0, share: 0, makeRate: null },
  ];
  const byBand = new Map(bands.map((row) => [row.band, row]));
  for (const shot of shots) {
    if (!isPlottablePlayerShot(shot)) continue;
    const band = playerShotBand(shot);
    const row = band ? byBand.get(band) : undefined;
    if (!row) continue;
    row.attempts += 1;
    row.makes += shot.made ? 1 : 0;
  }
  const total = bands.reduce((sum, row) => sum + row.attempts, 0);
  return bands.map((row) => ({
    ...row,
    share: total ? row.attempts / total : 0,
    makeRate: row.attempts ? row.makes / row.attempts : null,
  }));
}

/**
 * Divide the chart at the painted-lane edges to quantify lateral tendency.
 * Labels describe the chart orientation and do not infer player handedness.
 */
export function playerShotSide(
  shot: Pick<PlayerShotLocation, "x">,
): PlayerShotSide | null {
  if (!isFiniteNumber(shot.x)) return null;
  if (shot.x < -PLAYER_COURT_LANE_EDGE_FT) return "Chart left";
  if (shot.x > PLAYER_COURT_LANE_EDGE_FT) return "Chart right";
  return "Middle";
}

export function summarizePlayerShotSides(shots: readonly PlayerShotLocation[]) {
  const sides: Array<{
    side: PlayerShotSide;
    attempts: number;
    makes: number;
    share: number;
    makeRate: number | null;
  }> = [
    { side: "Chart left", attempts: 0, makes: 0, share: 0, makeRate: null },
    { side: "Middle", attempts: 0, makes: 0, share: 0, makeRate: null },
    { side: "Chart right", attempts: 0, makes: 0, share: 0, makeRate: null },
  ];
  const bySide = new Map(sides.map((row) => [row.side, row]));
  for (const shot of shots) {
    if (!isPlottablePlayerShot(shot)) continue;
    const side = playerShotSide(shot);
    const row = side ? bySide.get(side) : undefined;
    if (!row) continue;
    row.attempts += 1;
    row.makes += shot.made ? 1 : 0;
  }
  const total = sides.reduce((sum, row) => sum + row.attempts, 0);
  return sides.map((row) => ({
    ...row,
    share: total ? row.attempts / total : 0,
    makeRate: row.attempts ? row.makes / row.attempts : null,
  }));
}

/** Build a deterministic 10 × 9 attempt-density grid for a player. */
export function buildPlayerCourtZones(
  shots: readonly PlayerShotLocation[],
  columns = 10,
  rows = 9,
): PlayerCourtZone[] {
  const width = (PLAYER_COURT.xMax - PLAYER_COURT.xMin) / columns;
  const height = (PLAYER_COURT.yMax - PLAYER_COURT.yMin) / rows;
  const cells = Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      key: `${column}-${row}`,
      column,
      row,
      x: column * width * 10,
      y: row * height * 10,
      width: width * 10,
      height: height * 10,
      attempts: 0,
      makes: 0,
      makeRate: null,
      share: 0,
    } satisfies PlayerCourtZone;
  });
  for (const shot of shots) {
    if (!isPlottablePlayerShot(shot)) continue;
    const column = Math.min(columns - 1, Math.max(0, Math.floor((shot.x! - PLAYER_COURT.xMin) / width)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((shot.y! - PLAYER_COURT.yMin) / height)));
    const cell = cells[row * columns + column];
    cell.attempts += 1;
    cell.makes += shot.made ? 1 : 0;
  }
  const total = cells.reduce((sum, cell) => sum + cell.attempts, 0);
  return cells.map((cell) => ({
    ...cell,
    makeRate: cell.attempts ? cell.makes / cell.attempts : null,
    share: total ? cell.attempts / total : 0,
  }));
}
