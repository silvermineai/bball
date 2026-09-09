"""Freeze generated matchup reading views and their linked local evidence.

No network access. Captures the built article, removes app controls and scripts,
and preserves linked data bytes. This is a reading snapshot, not a pixel clone.
"""

import gzip
import hashlib
import html
import json
import mimetypes
import re
from pathlib import Path
from urllib.parse import urlsplit

from bs4 import BeautifulSoup, Comment

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "frontend/dist/client"
WORK = ROOT / ".local/brief-archive"
OBJECT_URL = "/archive/brief-objects/"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class Capture:
    def __init__(self, build):
        self.build = Path(build).resolve()
        self.objects = {}
        self.paths = {}

    def add(self, data, content_type):
        digest = sha(data)
        item = {"sha256": digest, "raw_size": len(data), "content_type": content_type}
        if digest in self.objects and self.objects[digest][0] != item:
            raise ValueError("Archive object metadata conflict")
        self.objects[digest] = (item, data)
        return digest

    def asset(self, path):
        if path in self.paths:
            return self.paths[path]
        url = urlsplit(path)
        file = (self.build / url.path.lstrip("/")).resolve()
        if (
            url.scheme
            or url.netloc
            or url.query
            or url.fragment
            or not file.is_relative_to(self.build)
        ):
            raise ValueError("Archive dependency must be a local build file")
        data = file.read_bytes()
        mime = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        if file.suffix == ".css":
            css = data.decode()
            # Frozen pages use installed fallback fonts; no third-party font requests.
            css = re.sub(
                r'@import\s+(?:"[^"]*"|\'[^\']*\'|url\([^)]*\))[^;]*;', "", css
            )
            for target in re.findall(r"url\(([^)]+)\)", css):
                target = target.strip("\"'")
                if not target.startswith("data:"):
                    raise ValueError("Uncaptured CSS dependency")
            data = css.encode()
        digest = self.add(data, mime)
        self.paths[path] = digest
        return digest

    def article(self, raw, metadata, evidence_files=()):
        soup = BeautifulSoup(raw, "lxml")
        article = soup.select_one("main article.matchup-brief")
        if article is None:
            raise ValueError("Missing generated matchup article")
        if metadata["model_id"] not in article.get_text():
            raise ValueError("Built article differs from forecast model")
        for node in article.select(
            ".brief-notebook, .football-evidence-controls, script, style, button, input, select, textarea, iframe, object, embed, form, .screen-only"
        ):
            node.decompose()
        for node in article.find_all(string=lambda text: isinstance(text, Comment)):
            node.extract()
        dependencies = []
        styles = []
        for node in soup.select('link[rel="stylesheet"]'):
            digest = self.asset(node["href"])
            dependencies.append(digest)
            styles.append(f'<link rel="stylesheet" href="{OBJECT_URL}{digest}">')
        if not styles:
            raise ValueError("Missing article stylesheet")
        for node in article.find_all(True):
            for attr in list(node.attrs):
                if attr.startswith(("on", "data-")) or attr in {
                    "nonce",
                    "srcdoc",
                    "formaction",
                }:
                    del node[attr]
            for attr in ["href", "src", "xlink:href"]:
                target = node.get(attr)
                if not target:
                    continue
                if target.startswith("/data/"):
                    digest = self.asset(target)
                    dependencies.append(digest)
                    node[attr] = OBJECT_URL + digest
                    node.attrs.pop("download", None)
                elif target.startswith("//") or not target.startswith(
                    ("https://", "/", "#")
                ):
                    del node[attr]
                elif attr != "href":
                    raise ValueError("Uncaptured image or SVG dependency")
            if node.has_attr("target"):
                node["rel"] = "noopener noreferrer"
        evidence_links = []
        for file in evidence_files:
            digest = self.asset(file)
            dependencies.append(digest)
            evidence_links.append(
                f'<li><a href="{OBJECT_URL}{digest}">{html.escape(file.removeprefix("/data/"))}</a></li>'
            )
        title = html.escape(
            f"{metadata['away_name']} vs {metadata['home_name']} — archived matchup brief"
        )
        record = (
            f"/research/briefs/?sport={metadata['sport']}&game={metadata['game_id']}"
        )
        history = f"/research/game/?sport={metadata['sport']}&id={metadata['game_id']}"
        banner = f'''<header class="archive-banner"><a href="/research/briefs/">Matchup reading archive</a><h1>Frozen reading snapshot</h1><p>This preserves the generated article’s default view and linked evidence. Interactive controls and private browser notes are excluded; typography uses installed fallback fonts. Its predictions and schedule are historical statements, not a current game status.</p><p><a href="{record}">Capture dates and other versions</a> · <a href="{history}">Latest recorded game history</a> · <a href="{metadata["original_path"]}">Current brief URL</a></p></header>'''
        content = (
            '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            + f'<title>{title}</title><meta name="robots" content="noindex,follow">'
            + "".join(styles)
            + "<style>.archive-banner,main{max-width:1200px;margin:32px auto;padding:0 22px}.archive-banner{border:1px solid #9baba0;padding:24px;background:#e8ecdf}.archive-banner h1{font:28px Georgia,serif;margin:12px 0}.archive-banner p{font:14px/1.8 Arial,sans-serif;margin:12px 0}.archive-banner a{text-decoration:underline}.archive-banner+main{padding-bottom:40px}</style></head><body>"
            + banner
            + "<main>"
            + str(article)
            + "<details><summary>Frozen supporting data files</summary><p>These downloads retain this snapshot’s bytes. Other program, player and methodology links open the current site.</p><ul>"
            + "".join(evidence_links)
            + "</ul></details></main></body></html>"
        ).encode()
        digest = self.add(content, "text/html")
        return {
            **metadata,
            "revision": digest,
            "original_html_sha256": sha(raw),
            "dependencies_json": compact(sorted(set(dependencies))),
        }


def build_capture(build=BUILD):
    capture = Capture(build)
    versions = []
    for sport in ["football", "basketball"]:
        overview = json.loads((Path(build) / f"data/{sport}/overview.json").read_text())
        for game in overview["upcoming"]:
            if not game["prediction"]:
                continue
            if not re.fullmatch(r"\d{1,15}", game["id"]):
                raise ValueError("Invalid archive game ID")
            route = (
                f"/blog/game-{game['id']}/"
                if sport == "football"
                else f"/basketball/briefs/{game['id']}/"
            )
            metadata = {
                "sport": sport,
                "game_id": game["id"],
                "season": overview["season"],
                "home_name": game["home_name"],
                "away_name": game["away_name"],
                "starts_at": game["kickoff" if sport == "football" else "starts_at"],
                "time_tbd": game["time_tbd"],
                "model_id": overview["model"]["id"],
                "forecast_generated_at": overview["generated_at"],
                "original_path": route,
            }
            evidence = [f"/data/{sport}/overview.json", "/data/research/ledger.json"]
            if sport == "basketball":
                evidence += [
                    f"/data/basketball/scouting/{game[side + '_id']}.json"
                    for side in ["home", "away"]
                ]
                evidence += ["/data/basketball/recruiting.json"]
            else:
                evidence += [
                    "/data/football/efficiency.json",
                    "/data/football/player-catalog.json",
                ]
            versions.append(
                capture.article(
                    (Path(build) / route.lstrip("/") / "index.html").read_bytes(),
                    metadata,
                    evidence,
                )
            )
    return capture, versions


def pack(capture, known, directory=WORK):
    """Independent gzip members allow bounded R2 range reads for each object."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    content = bytearray()
    records = []
    for digest, (metadata, raw) in sorted(capture.objects.items()):
        if digest in known:
            for field in ["raw_size", "content_type"]:
                if known[digest][field] != metadata[field]:
                    raise ValueError("Stored archive object metadata conflict")
            continue
        compressed = gzip.compress(raw, mtime=0)
        records.append(
            {**metadata, "byte_offset": len(content), "byte_length": len(compressed)}
        )
        content.extend(compressed)
    if not records:
        return None, []
    bundle = directory / f"{sha(content)}.pack"
    bundle.write_bytes(content)
    key = "brief-archive/" + bundle.name
    for record in records:
        record["bundle_key"] = key
    return bundle, records


def verify_pack(bundle, records):
    data = Path(bundle).read_bytes()
    if sha(data) + ".pack" != Path(bundle).name:
        raise ValueError("Archive bundle hash mismatch")
    for r in records:
        raw = gzip.decompress(
            data[r["byte_offset"] : r["byte_offset"] + r["byte_length"]]
        )
        if sha(raw) != r["sha256"] or len(raw) != r["raw_size"]:
            raise ValueError("Archive object hash mismatch")


def sql_insert(table, rows):
    """Build bounded multi-row inserts for reliable remote D1 imports.

    The archive can contain thousands of small objects. One statement per row
    makes Wrangler submit an unnecessarily large import job; small multi-row
    statements keep retries idempotent while staying below the per-statement
    size guard in the publisher.
    """
    def quote(value):
        return "'" + str(value).replace("'", "''") + "'"

    rows = list(rows)
    if not rows:
        return ""
    columns = ",".join(rows[0])
    statements = []
    for start in range(0, len(rows), 50):
        batch = rows[start : start + 50]
        values = ",".join(
            "(" + ",".join(quote(value) for value in row.values()) + ")"
            for row in batch
        )
        statements.append(f"INSERT OR IGNORE INTO {table} ({columns}) VALUES {values};")
    return "\n".join(statements) + "\n"
