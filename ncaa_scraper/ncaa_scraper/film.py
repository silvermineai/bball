"""Film room: pull latest videos from official YouTube channels via public RSS.

No API key required — YouTube publishes an RSS feed per channel:
  https://www.youtube.com/feeds/videos.xml?channel_id=<id>

Channel IDs are resolved once from the public channel pages (by handle) and
cached in the espn_film_channels table. Videos are matched to teams by name
and written to frontend/public/data/film.json.

Run:  python -m ncaa_scraper.film
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "data" / "ncaa_mbb.sqlite3"
OUT_PATH = REPO_ROOT / "frontend" / "public" / "data" / "film.json"

# Official channels (by public handle). All league/NCAA-operated accounts.
CHANNEL_HANDLES = [
    ("@marchmadness", "NCAA March Madness"),
    ("@bigten", "Big Ten Network"),
    ("@ACCDigitalNetwork", "ACC Digital Network"),
    ("@BigEastConference", "Big East"),
    ("@secnetwork", "SEC Network"),
    ("@Big12Conference", "Big 12 Conference"),
    ("@PacificTakes", "Pac-12 Networks"),
]

BBALL_PATTERN = re.compile(
    r"basketball|march madness|final four|hoops|mbb|buzzer|dunk|three-?point|ncaa tournament|elite eight|sweet 16|sweet sixteen|bracket",
    re.IGNORECASE,
)

ATOM = "{http://www.w3.org/2005/Atom}"
MEDIA = "{http://search.yahoo.com/mrss/}"
YT = "{http://www.youtube.com/xml/schemas/2015}"

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
})


def resolve_channel_id(handle: str) -> str | None:
    try:
        resp = session.get(f"https://www.youtube.com/{handle}", timeout=30)
        if resp.status_code != 200:
            return None
        m = re.search(r'"(?:channelId|externalId)":"(UC[\w-]{22})"', resp.text)
        return m.group(1) if m else None
    except requests.RequestException:
        return None


def fetch_feed(channel_id: str) -> list[dict]:
    try:
        resp = session.get(
            "https://www.youtube.com/feeds/videos.xml",
            params={"channel_id": channel_id},
            timeout=30,
        )
        if resp.status_code != 200:
            return []
        root = ET.fromstring(resp.content)
    except (requests.RequestException, ET.ParseError):
        return []
    videos = []
    for entry in root.findall(f"{ATOM}entry"):
        vid = entry.findtext(f"{YT}videoId")
        title = entry.findtext(f"{ATOM}title")
        published = entry.findtext(f"{ATOM}published")
        group = entry.find(f"{MEDIA}group")
        thumb = None
        if group is not None:
            thumb_el = group.find(f"{MEDIA}thumbnail")
            if thumb_el is not None:
                thumb = thumb_el.get("url")
        if vid and title:
            videos.append({"videoId": vid, "title": title, "published": published, "thumbnail": thumb})
    return videos


def build_team_matchers(conn: sqlite3.Connection) -> list[tuple[re.Pattern, int]]:
    matchers = []
    for row in conn.execute("SELECT id, location, nickname, short_name FROM espn_teams"):
        tid = row[0]
        for name in {row[1], row[2], row[3]}:
            if name and len(name) >= 4:  # skip too-short/ambiguous tokens
                matchers.append((re.compile(rf"\b{re.escape(name)}\b", re.IGNORECASE), tid))
    return matchers


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    matchers = build_team_matchers(conn)

    all_videos = []
    for handle, label in CHANNEL_HANDLES:
        channel_id = resolve_channel_id(handle)
        if not channel_id:
            print(f"{label}: could not resolve channel id", file=sys.stderr)
            continue
        videos = fetch_feed(channel_id)
        for v in videos:
            team_ids = sorted({tid for pattern, tid in matchers if pattern.search(v["title"])})
            v["channel"] = label
            v["teamIds"] = team_ids
            v["basketball"] = bool(BBALL_PATTERN.search(v["title"])) or (label == "NCAA March Madness")
        all_videos.extend(videos)
        print(f"{label}: {len(videos)} videos")

    all_videos.sort(key=lambda v: v.get("published") or "", reverse=True)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump({"videos": all_videos}, f, separators=(",", ":"))
    print(f"film.json: {len(all_videos)} videos")
    conn.close()


if __name__ == "__main__":
    main()
