"""Publish reviewed school announcements without crawling or copying school rosters."""

import hashlib
import json
import re
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data/recruiting/announcements.json"
PUBLIC = ROOT / "frontend/public/data/basketball/recruiting.json"
SQL = ROOT / ".local/recruiting.sql"
# Explicit spelling differences between school announcement and bulk box provider.
PRIOR_ALIASES = {
    "Jacksonville State": "Jax State",
    "Northern Arizona": "N Arizona",
    "Boise State": "Boise St",
    "Mississippi State": "Mississippi St",
    "San Diego State": "San Diego St",
    "Purdue Fort Wayne": "Purdue FW",
    "Arizona State": "Arizona St",
    "Seattle": "Seattle U",
    "College of Charleston": "Charleston",
}
# A source display-name correction can differ from a reviewed school spelling.
# Keep these aliases keyed to the curated person identity; the explicit player
# and team IDs below remain mandatory before any historical link is published.
PRIOR_PLAYER_NAME_ALIASES = {
    "62-marcus-adams-jr": {"Marcus Adams"},
}
KINDS = {"addition", "redshirt_announced", "season_unavailable"}


def canonical(value):
    value = unicodedata.normalize("NFKD", value).casefold()
    return "".join(c for c in value if c.isalnum() and not unicodedata.combining(c))


def compact(value):
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def digest(value):
    return hashlib.sha256(compact(value).encode()).hexdigest()


def parse_timestamp(value):
    """Parse the UTC ``Z`` form on Python versions before 3.11 as well."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def keyed(rows, field):
    result = {row[field]: row for row in rows}
    if len(result) != len(rows):
        raise ValueError(f"Duplicate {field}")
    return result


def _review_queue(document, roster_release):
    """Build a receipt-backed human review queue from the target roster edition.

    This is a coverage queue, not a transaction classifier.  A roster row can
    be new to the retained roster release without being a transfer or an
    available player, so the queue only reports the source's recorded workload
    and whether the program has a reviewed school-announcement record.
    """
    if not isinstance(roster_release, dict):
        raise ValueError("Roster release is required to build the review queue")
    if roster_release.get("season") != document["season"]:
        raise ValueError("Recruiting and roster releases use different seasons")
    summaries = roster_release.get("team_summaries")
    if not isinstance(summaries, list):
        raise ValueError("Roster release has no team summaries")
    source = roster_release.get("source")
    if not isinstance(source, dict):
        raise ValueError("Roster release has no source receipt")
    source_sha256 = str(source.get("sha256") or "").strip().lower()
    if not re.fullmatch(r"[a-f0-9]{64}", source_sha256):
        raise ValueError("Roster release source receipt is not a SHA-256 digest")
    source_captured_at = source.get("fetched_at")
    if not isinstance(source_captured_at, str) or not source_captured_at.strip():
        raise ValueError("Roster release source receipt has no capture clock")

    reviewed_programs = {str(program["id"]) for program in document["programs"]}
    rows = []
    seen = set()
    numeric_fields = (
        "listed_players", "returning_players", "transfer_players", "new_players",
        "ambiguous_players", "prior_minutes", "returning_minutes",
        "incoming_prior_minutes", "represented_prior_minutes",
        "unrepresented_prior_minutes",
    )
    for summary in summaries:
        if not isinstance(summary, dict):
            raise ValueError("Roster review queue contains a malformed summary")
        team_id = str(summary.get("team_id") or "").strip()
        team = str(summary.get("team") or "").strip()
        if not team_id or not team or team_id in seen:
            raise ValueError("Roster review queue contains duplicate or blank program identity")
        seen.add(team_id)
        values = {}
        for field in numeric_fields:
            value = summary.get(field)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
                raise ValueError(f"Roster review queue has invalid {field} for {team_id}")
            values[field] = value
        returning_share = summary.get("returning_minutes_share")
        represented_share = summary.get("represented_prior_minutes_share")
        for field, value in (("returning_minutes_share", returning_share), ("represented_prior_minutes_share", represented_share)):
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1):
                raise ValueError(f"Roster review queue has invalid {field} for {team_id}")
        rows.append({
            "team_id": team_id,
            "team": team,
            "evidence_status": "reviewed" if team_id in reviewed_programs else "roster_observation",
            **values,
            "returning_minutes_share": returning_share,
            "represented_prior_minutes_share": represented_share,
        })
    rows.sort(
        key=lambda row: (
            row["evidence_status"] == "reviewed",
            -float(row["unrepresented_prior_minutes"]),
            -float(row["prior_minutes"]),
            row["team"].casefold(),
            row["team_id"],
        )
    )
    reviewed_program_count = sum(row["evidence_status"] == "reviewed" for row in rows)
    return {
        "season": document["season"],
        "source_dataset": source.get("dataset") or "rosters",
        "source_captured_at": source_captured_at,
        "source_sha256": source_sha256,
        # ``reviewed_programs`` is the count that can be reconciled to this
        # roster edition. Keep source-only reviewed IDs explicit rather than
        # inflating the queue denominator with a program that has no roster
        # row in the target release.
        "reviewed_programs": reviewed_program_count,
        "source_reviewed_programs": len(reviewed_programs),
        "reviewed_not_observed_programs": len(reviewed_programs) - reviewed_program_count,
        "observed_programs": len(rows),
        "unreviewed_programs": sum(row["evidence_status"] == "roster_observation" for row in rows),
        "rows": rows,
    }


def build(document, box_release, rated_programs, roster_release=None):
    """Require reviewed identities and dates; never infer status from roster absence."""
    if document["schema_version"] != 1 or document["season"] != 2027:
        raise ValueError("Unsupported announcement schema/season")
    programs = keyed(document["programs"], "id")
    sources = keyed(document["sources"], "id")
    people = keyed(document["people"], "key")
    keyed(document["events"], "id")
    for program in programs.values():
        if program["id"] not in rated_programs:
            raise ValueError("Unknown program ID")
        if canonical(program["name"]) != canonical(rated_programs[program["id"]]):
            raise ValueError("Program identity/name mismatch")
    now = datetime.now(timezone.utc)
    output_sources = []
    for source in sources.values():
        program = programs[source["team_id"]]
        url = urlsplit(source["url"])
        official_article_path = url.path.startswith("/news/") or (
            program["host"] == "arkansasrazorbacks.com"
            and url.path.startswith("/razorback-basketball-")
        )
        if (
            url.scheme != "https"
            or url.netloc != program["host"]
            or not official_article_path
            or url.query
            or url.fragment
        ):
            raise ValueError("Source must be an exact school news URL")
        published = date.fromisoformat(source["published_on"])
        checked = parse_timestamp(source["checked_at"])
        if (
            checked.tzinfo is None
            or checked > now
            or published > checked.date()
            or published.year not in (2025, 2026, 2027)
        ):
            raise ValueError("Invalid publication/review chronology")
        if not source["date_basis"] or source["publisher"] != program["publisher"]:
            raise ValueError("Missing publication evidence")
        # Hash reviewed source metadata before adding the receipt itself. This
        # provides a stable integrity check without republishing article text.
        output_sources.append({**source, "source_sha256": digest(source)})
    output_people = []
    for person in people.values():
        if person["team_id"] not in programs or person["category"] not in {
            "transfer",
            "freshman",
            "international",
        }:
            raise ValueError("Invalid person classification")
        if not re.fullmatch(r"[a-z0-9-]+", person["key"]):
            raise ValueError("Invalid local person key")
        records = [e for e in document["events"] if e["person_key"] == person["key"]]
        if len([e for e in records if e["kind"] == "addition"]) != 1:
            raise ValueError(
                "Every tracked addition requires exactly one addition event"
            )
        stats = None
        ref = person["stats_ref"]
        if ref:
            if (
                person["category"] != "transfer"
                or ref["season"] != box_release["season"]
                or not ref["basis"]
            ):
                raise ValueError(
                    "Historical stats require reviewed prior college identity"
                )
            # Require uniqueness in name + prior-program space AND the explicit reviewed ID.
            candidates = [
                p
                for p in box_release["players"]
                if (
                    canonical(p["name"]) == canonical(person["name"])
                    or p["name"] in PRIOR_PLAYER_NAME_ALIASES.get(person["key"], set())
                )
                and canonical(p["team"])
                == canonical(
                    PRIOR_ALIASES.get(
                        person["previous_program"], person["previous_program"]
                    )
                )
                and p["season"] == ref["season"]
            ]
            if (
                len(candidates) != 1
                or candidates[0]["id"] != ref["player_id"]
                or candidates[0]["team_id"] != ref["team_id"]
            ):
                raise ValueError(
                    f"Historical identity unresolved/ambiguous: {person['name']}"
                )
            p = candidates[0]
            stats = {
                key: p[key]
                if key not in {"ft_rate", "three_rate", "tov_rate"}
                else p.get(key)
                for key in (
                    "id",
                    "team_id",
                    "team",
                    "season",
                    "games",
                    "mpg",
                    "ppg",
                    "rpg",
                    "apg",
                    "spg",
                    "bpg",
                    "topg",
                    "efg",
                    "ts",
                    "three_pct",
                    "ft_pct",
                    "ft_rate",
                    "three_rate",
                    "tov_rate",
                    "incomplete_box_games",
                )
            }
            stats["identity_basis"] = ref["basis"]
        output_people.append(
            {**{k: v for k, v in person.items() if k != "stats_ref"}, "stats": stats}
        )
    for event in document["events"]:
        if event["kind"] not in KINDS or not event["summary"].strip():
            raise ValueError("Unsupported/empty event")
        person, source = people[event["person_key"]], sources[event["source_id"]]
        if source["team_id"] != person["team_id"]:
            raise ValueError("Announcement publisher differs from player program")
    result = {
        "schema_version": 1,
        "season": document["season"],
        "reviewed_at": max(s["checked_at"] for s in sources.values()),
        "coverage": {
            "programs": len(programs),
            "players": len(people),
            "events": len(document["events"]),
            "sources": len(sources),
            "historical_links": sum(p["stats"] is not None for p in output_people),
            "complete_national_coverage": False,
        },
        "methodology": "Selected school announcements, independently summarized. Publication dates are not effective transfer dates. A signing does not establish eligibility or current availability. Coverage is partial, including within listed programs. These records do not change model forecasts.",
        "stats_source": {
            "publisher": "SportsDataverse",
            "url": "https://github.com/sportsdataverse/sportsdataverse-data",
            "license": "CC BY 4.0",
            "season": box_release["season"],
            "release_sha256": digest(box_release),
        },
        "programs": list(programs.values()),
        "sources": output_sources,
        "people": output_people,
        "events": document["events"],
    }
    if roster_release is not None:
        result["review_queue"] = _review_queue(document, roster_release)
    result["edition"] = digest(result)
    return result


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def sql_export(release):
    """Immutable releases; the active pointer is written only after all records exist."""
    edition = release["edition"]
    lines = []
    for event in release["events"]:
        person = next(p for p in release["people"] if p["key"] == event["person_key"])
        source = next(s for s in release["sources"] if s["id"] == event["source_id"])
        evidence = {
            "event": event,
            "person": person,
            "source": source,
            "season": release["season"],
        }
        lines.append(
            "INSERT OR IGNORE INTO bb_recruiting_evidence (revision,event_id,season,team_id,published_on,payload_json) VALUES ("
            + ",".join(
                map(
                    quote,
                    [
                        digest(evidence),
                        event["id"],
                        release["season"],
                        person["team_id"],
                        source["published_on"],
                        compact(evidence),
                    ],
                )
            )
            + ");"
        )
    lines.append(
        "INSERT OR IGNORE INTO bb_recruiting_releases (edition,season,payload_json) VALUES ("
        + ",".join(map(quote, [edition, release["season"], compact(release)]))
        + ");"
    )
    lines.append(
        "INSERT INTO bb_recruiting_current (season,edition) VALUES ("
        + ",".join(map(quote, [release["season"], edition]))
        + ") ON CONFLICT(season) DO UPDATE SET edition=excluded.edition;"
    )
    return "\n".join(lines) + "\n"


def main():
    document = json.loads(SOURCE.read_text())
    box_release = json.loads((PUBLIC.parent / "players.json").read_text())
    overview = json.loads((PUBLIC.parent / "overview.json").read_text())
    rosters = json.loads((PUBLIC.parent / "rosters.json").read_text())
    release = build(
        document,
        box_release,
        {p["id"]: p["name"] for p in overview["ratings"]},
        rosters,
    )
    PUBLIC.write_text(
        json.dumps(release, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    )
    SQL.parent.mkdir(parents=True, exist_ok=True)
    SQL.write_text(sql_export(release))
    print(json.dumps(release["coverage"]))


if __name__ == "__main__":
    main()
