import type { BBRosters } from "../_lib/basketball-types";
import type { RecruitingRelease } from "../_lib/recruiting";
import type { ShotSeason } from "../_lib/shooting";
import type { NotebookRecentForm } from "./notebook-form";

export type NotebookEvidenceRow = {
  key: string;
  label: string;
  coverage: string;
  receipt: string;
  captured: string | null;
  status: "verified" | "edition" | "unavailable";
  learning: string;
};

export type NotebookEvidenceInput = {
  homeId: string;
  awayId: string;
  forecastModelId: string;
  forecastCapturedAt: string;
  recentForm: NotebookRecentForm | null;
  historicalPlayerCount: number;
  shotEdition: ShotSeason | null;
  shotPlayerJoins: number;
  shotAttempts: number;
  shotLocated: number;
  recruiting: RecruitingRelease | null;
  rosterSource: BBRosters["source"];
  rosterSeason: number;
  rosterRows: number;
};

const digest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/i.test(value.trim());

const timestamp = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));

const safeCount = (value: number) => Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;

/**
 * Build the evidence chain shown beside a game notebook. The rows deliberately
 * distinguish a model edition from a content receipt: a model ID identifies the
 * registered forecast, while a SHA-256 digest proves which retained source
 * release supplied the descriptive evidence.
 */
export function buildNotebookEvidenceRows(input: NotebookEvidenceInput): NotebookEvidenceRow[] {
  const exactTeamIds = new Set([input.homeId, input.awayId]);
  const recruitingPrograms = input.recruiting?.programs.filter((program) => exactTeamIds.has(program.id)).length ?? 0;
  const recruitingPeople = input.recruiting?.people.filter((person) => exactTeamIds.has(person.team_id)).length ?? 0;
  const recruitingSources = input.recruiting?.sources.filter((source) => exactTeamIds.has(source.team_id)).length ?? 0;
  const recruitingValid = Boolean(
    input.recruiting
    && Number.isInteger(input.recruiting.season)
    && digest(input.recruiting.edition)
    && timestamp(input.recruiting.reviewed_at),
  );
  const shotSource = input.shotEdition?.source;
  const shotValid = Boolean(
    input.shotEdition
    && Number.isInteger(input.shotEdition.season)
    && digest(shotSource?.sha256)
    && timestamp(shotSource?.fetched_at),
  );
  const rosterValid = Boolean(
    input.rosterSource
    && typeof input.rosterSource.dataset === "string"
    && input.rosterSource.dataset.trim()
    && digest(input.rosterSource.sha256)
    && timestamp(input.rosterSource.fetched_at),
  );
  const scoutingValid = Boolean(
    input.recentForm
    && input.recentForm.sourceEdition.trim()
    && timestamp(input.recentForm.generatedAt)
    && input.recentForm.home.id === input.homeId
    && input.recentForm.away.id === input.awayId,
  );

  return [
    {
      key: "forecast",
      label: "Forecast edition",
      coverage: input.forecastModelId.trim() || "Model edition unavailable",
      receipt: input.forecastModelId.trim() || "Unavailable",
      captured: timestamp(input.forecastCapturedAt) ? input.forecastCapturedAt : null,
      status: input.forecastModelId.trim() && timestamp(input.forecastCapturedAt) ? "edition" : "unavailable",
      learning: "Use this ID and capture clock when comparing the forecast with a later result.",
    },
    {
      key: "scouting",
      label: "Team + player archive",
      coverage: scoutingValid
        ? `${safeCount(input.historicalPlayerCount)} exact player profiles · two team profiles`
        : "Exact scouting edition unavailable",
      receipt: scoutingValid ? input.recentForm!.sourceEdition : "Unavailable",
      captured: scoutingValid ? input.recentForm!.generatedAt : null,
      status: scoutingValid ? "edition" : "unavailable",
      learning: "Historical workload describes the old sample; it does not establish current availability.",
    },
    {
      key: "shots",
      label: "Shot coordinate archive",
      coverage: shotValid
        ? `${safeCount(input.shotPlayerJoins)} exact joins · ${safeCount(input.shotAttempts).toLocaleString()} matched attempts · ${safeCount(input.shotLocated).toLocaleString()} located`
        : "Coordinate release unavailable",
      receipt: shotValid ? shotSource!.sha256 : "Unavailable",
      captured: shotValid ? shotSource!.fetched_at : null,
      status: shotValid ? "verified" : "unavailable",
      learning: "Located attempts are a subset of matched attempts; missing coordinates stay missing.",
    },
    {
      key: "recruiting",
      label: "Recruiting release",
      coverage: recruitingValid
        ? `${recruitingPrograms}/2 exact programs · ${recruitingPeople} people · ${recruitingSources} reviewed sources`
        : "Recruiting release unavailable",
      receipt: recruitingValid ? input.recruiting!.edition : "Unavailable",
      captured: recruitingValid ? input.recruiting!.reviewed_at : null,
      status: recruitingValid ? "verified" : "unavailable",
      learning: "A dated announcement is evidence of an event, not proof of eligibility or a projected role.",
    },
    {
      key: "roster",
      label: "Roster observation",
      coverage: rosterValid
        ? `${safeCount(input.rosterRows)} listed rows · ${input.rosterSeason} snapshot`
        : "Roster receipt unavailable",
      receipt: rosterValid ? input.rosterSource!.sha256! : "Unavailable",
      captured: rosterValid ? input.rosterSource!.fetched_at : null,
      status: rosterValid ? "verified" : "unavailable",
      learning: "Roster status is an observed listing label; it is not a lineup or eligibility ruling.",
    },
  ];
}
