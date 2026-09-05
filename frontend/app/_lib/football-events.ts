export type EventDataset = "defense" | "specialists";
export type EventField = { key: string; label: string; definition: string };
export type EventEdition = {
  dataset: EventDataset;
  season: number;
  edition: string;
  generated_at: string;
  fields: EventField[];
  teams: { id: string; name: string; records: number }[];
  coverage: {
    records: number;
    games: number;
    teams: number;
    matched_context: number;
    name_only_records: number;
    fields: Record<string, { available: number; positive: number }>;
  };
  evidence: {
    implementation_sha256: string;
    definitions_url: string;
    sources: {
      dataset: string;
      url: string;
      fetched_at: string;
      sha256: string;
    }[];
  };
};
export type EventIndex = {
  generated_at: string;
  editions: EventEdition[];
  limitations: string[];
};
export type EventRecord = {
  record_key: string;
  dataset: EventDataset;
  season: number;
  game_id: string | null;
  team_id: string | null;
  team: string;
  division: string;
  player_name: string;
  identity_status: "name_only";
  context_status: string;
  game: {
    id: string;
    kickoff: string;
    home_id: string;
    away_id: string;
    home_name: string;
    away_name: string;
    home_score: number | null;
    away_score: number | null;
    completed: number;
    neutral: number;
    time_tbd: number;
    opponent: string;
  } | null;
  metrics: Record<string, number | null>;
  raw: Record<string, string>;
};
export type EventResponse = {
  rows: EventRecord[];
  total: number;
  page: number;
  page_size: number;
  edition: string;
  dataset: EventDataset;
  season: number;
  evidence: EventEdition["evidence"];
  coverage: EventEdition["coverage"];
};
export function eventCsv(
  rows: EventRecord[],
  fields: EventField[],
  edition: string,
): string {
  const cell = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (typeof value === "string" && /^[\s]*[=+@-]/.test(text))
      text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const header = [
    "edition",
    "source_record_key",
    "dataset",
    "season",
    "source_player_name",
    "team",
    "team_id",
    "game_id",
    "kickoff",
    "opponent",
    "identity_status",
    "context_status",
    ...fields.map((f) => f.key),
  ];
  const body = rows.map((r) => [
    edition,
    r.record_key,
    r.dataset,
    r.season,
    r.player_name,
    r.team,
    r.team_id,
    r.game_id,
    r.game?.kickoff,
    r.game?.opponent,
    r.identity_status,
    r.context_status,
    ...fields.map((f) => r.metrics[f.key]),
  ]);
  return [header, ...body].map((row) => row.map(cell).join(",")).join("\r\n");
}

export function formatEventMetric(value: number | null | undefined): string {
  return value == null
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
