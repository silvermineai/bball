"""Capture NCAA.com women’s DII/DIII basketball leaderboards.

The NCAA.com sport route carries the division in the source URL and page
metadata.  This capture keeps those rows in a separate source-native edition:
the pages publish athlete names and school slugs, but no athlete IDs, so the
rows are deliberately not merged into the ESPN roster or player model.

The script respects NCAA.com robots.txt, uses a descriptive user agent, and
stores a SHA-256 receipt for every response.  It fetches the public current
season individual and team statistic pages listed in each division's source
selector, preserving the complete table cells rather than interpreting names
as identities.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend/public/data/basketball/womens-lower-division-stats.json"
BASE = "https://www.ncaa.com"
ROBOTS = f"{BASE}/robots.txt"
USER_AGENT = "SilvermineResearch/1.0 (service@silvermineai.com)"
DIVISIONS = ("d2", "d3")
DELAY_SECONDS = 0.25

def slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return value or "unknown"


def number(value: str):
    cleaned = value.strip().replace(",", "")
    if not cleaned or cleaned in {"-", "—", "N/A"}:
        return None
    try:
        return float(cleaned) if "." in cleaned else int(cleaned)
    except ValueError:
        return cleaned


def page_date(soup: BeautifulSoup) -> str | None:
    text = " ".join(soup.get_text(" ", strip=True).split())
    match = re.search(r"Through games\s+([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})", text)
    return match.group(1) if match else None


def selectors(soup: BeautifulSoup, kind: str) -> list[tuple[str, str]]:
    select = soup.select_one(f"#select-container-{kind}")
    if select is None:
        raise RuntimeError(f"NCAA.com page omitted the {kind} statistic selector")
    rows = []
    for option in select.find_all("option"):
        href = option.get("value")
        label = " ".join(option.get_text(" ", strip=True).split())
        if href and href.startswith("/stats/") and label:
            rows.append((label, href))
    if not rows:
        raise RuntimeError(f"NCAA.com page published no {kind} statistic options")
    return rows


def statistics_to_capture(soup: BeautifulSoup, kind: str) -> list[tuple[str, str]]:
    """Return the complete source-published statistic selector set.

    Keeping this as a named contract makes it possible to test that the
    publisher does not silently narrow the source's current catalog.  Any
    future filtering must be explicit in the published limitation instead of
    dropping a legal public table while still advertising it as available.
    """
    return selectors(soup, kind)


def parse_table(soup: BeautifulSoup, kind: str, label: str, source_url: str) -> dict:
    table = soup.select_one("table.block-stats__stats-table") or soup.find("table")
    if table is None:
        raise RuntimeError(f"NCAA.com statistic page has no table: {source_url}")
    headers = [" ".join(cell.get_text(" ", strip=True).split()) for cell in table.select("thead th")]
    if not headers:
        raise RuntimeError(f"NCAA.com statistic page has no table headers: {source_url}")
    records = []
    for row in table.select("tbody tr"):
        cells = row.find_all("td")
        values = [" ".join(cell.get_text(" ", strip=True).split()) for cell in cells]
        if len(values) != len(headers):
            continue
        record = {slug(header): number(value) for header, value in zip(headers, values)}
        record["source_fields"] = dict(zip(headers, values))
        team_cell = cells[2 if kind == "individual" else 1] if len(cells) > (2 if kind == "individual" else 1) else None
        team_link = team_cell.find("a", href=True) if team_cell else None
        if team_link:
            record["team"] = " ".join(team_link.get_text(" ", strip=True).split())
            record["team_source_path"] = team_link["href"]
        records.append(record)
    return {
        "label": label,
        "statistic": slug(label),
        "kind": kind,
        "source_url": source_url,
        "through_games": page_date(soup),
        "headers": headers,
        "rows": records,
    }


def robots_parser(session: requests.Session) -> RobotFileParser:
    response = session.get(ROBOTS, timeout=30)
    response.raise_for_status()
    parser = RobotFileParser()
    parser.parse(response.text.splitlines())
    return parser


def main() -> None:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html"})
    robots = robots_parser(session)
    receipts = []
    divisions = {}
    last_request = 0.0

    def fetch(url: str) -> tuple[BeautifulSoup, str]:
        nonlocal last_request
        if not robots.can_fetch(USER_AGENT, url):
            raise RuntimeError(f"robots.txt disallows {url}")
        wait = DELAY_SECONDS - (time.monotonic() - last_request)
        if wait > 0:
            time.sleep(wait)
        response = session.get(url, timeout=45)
        last_request = time.monotonic()
        response.raise_for_status()
        body = response.content
        receipts.append({
            "url": url,
            "status": response.status_code,
            "sha256": hashlib.sha256(body).hexdigest(),
            "bytes": len(body),
        })
        return BeautifulSoup(body, "html.parser"), response.text

    for division in DIVISIONS:
        index_url = f"{BASE}/stats/basketball-women/{division}"
        index, _ = fetch(index_url)
        division_record = {
            "source_scope": {"sport": "basketball", "gender": "women", "division": int(division[1])},
            "source_url": index_url,
            "season": 2026,
            "through_games": page_date(index),
            "identity_status": "source_names_and_team_slugs_only",
            "identity_note": "NCAA.com publishes no athlete ID in these tables; rows remain separate and are not joined to ESPN identities.",
            "available_statistics": {
                "individual": [{"label": label, "source_path": path} for label, path in statistics_to_capture(index, "individual")],
                "team": [{"label": label, "source_path": path} for label, path in statistics_to_capture(index, "team")],
            },
            "individual": [],
            "team": [],
        }
        for kind in ("individual", "team"):
            # Capture every statistic currently exposed by the source selector.
            # The selector is the source-of-truth for legal public coverage;
            # keeping the full set prevents metadata from promising tables that
            # the published artifact silently omitted.
            for label, path in statistics_to_capture(index, kind):
                url = f"{BASE}{path}"
                page, _ = fetch(url)
                division_record[kind].append(parse_table(page, kind, label, url))
        divisions[division] = division_record

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    artifact = {
        "schema_version": 1,
        "generated_at": generated_at,
        "source": {
            "publisher": "NCAA.com",
            "robots_url": ROBOTS,
            "method": "Robots-permitted public NCAA.com statistic pages; raw response hashes are retained per page and normalized table cells are preserved.",
            "limitation": "NCAA.com lower-division tables expose names and team slugs but no athlete IDs; no name-only identity join or D1 substitution is performed.",
        },
        "divisions": divisions,
        "receipts": receipts,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(f"Published {OUT} ({len(receipts)} source responses)")


if __name__ == "__main__":
    main()
