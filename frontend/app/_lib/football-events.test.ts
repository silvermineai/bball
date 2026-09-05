import { describe, expect, it } from "vitest";
import {
  eventCsv,
  formatEventMetric,
  type EventRecord,
} from "./football-events";
const row: EventRecord = {
  record_key: "7",
  dataset: "defense",
  season: 2025,
  game_id: "1",
  team_id: "2",
  team: 'A, "quoted" team',
  division: "fbs",
  player_name: "=a_formula",
  identity_status: "name_only",
  context_status: "missing_game",
  game: null,
  metrics: {
    sacks: 0.5,
    sacks_yards: -3,
    interceptions: null,
    forced_fumbles: 0,
  },
  raw: {},
};
const fields = ["sacks", "sacks_yards", "interceptions", "forced_fumbles"].map(
  (key) => ({ key, label: key, definition: key }),
);
describe("event notebook CSV evidence", () => {
  it("displays fractional credits in counts and signed yardage", () => {
    expect(formatEventMetric(0.5)).toBe("0.5");
    expect(formatEventMetric(-3.5)).toBe("-3.5");
    expect(formatEventMetric(0)).toBe("0");
    expect(formatEventMetric(null)).toBe("—");
  });
  it("keeps missing values, zero and negative numeric yardage distinct", () => {
    const csv = eventCsv([row], fields, "edition-one");
    expect(csv).toContain('"0.5","-3","","0"');
    expect(csv).toContain('"name_only","missing_game"');
    expect(csv).toContain('"edition-one","7"');
  });
  it("escapes names and exports only the supplied page", () => {
    const csv = eventCsv([row], fields, "edition-one");
    expect(csv).toContain('"\'=a_formula"');
    expect(csv).toContain('"A, ""quoted"" team"');
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(eventCsv([], fields, "edition-one").split("\r\n")).toHaveLength(1);
  });
});
