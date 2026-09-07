"""Capture built matchup views, verify an R2 bundle, then register immutable D1 rows.

Called after a successful production deployment. Re-running is idempotent.
A failure can be retried directly without redeploying the website.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ncaa_scraper"))
from ncaa_scraper.brief_archive import (
    WORK,
    build_capture,
    pack,
    sql_insert,
    verify_pack,
)


def cf(args, capture=False):
    command = [sys.executable, str(ROOT / "scripts/cloudflare.py"), *args]
    if capture:
        return json.loads(subprocess.check_output(command, text=True, cwd=ROOT))[0][
            "results"
        ]
    subprocess.run(command, check=True, cwd=ROOT)


def query(sql):
    return cf(
        ["d1", "execute", "bball-silvermine", "--remote", "--command", sql, "--json"],
        capture=True,
    )


def selected(table, key, ids, columns="*"):
    values = sorted(set(ids))
    rows = []
    for start in range(0, len(values), 800):
        literals = ",".join("'" + v + "'" for v in values[start : start + 800])
        rows.extend(query(f"SELECT {columns} FROM {table} WHERE {key} IN ({literals})"))
    return rows


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    capture, versions = build_capture()
    cf(
        [
            "d1",
            "execute",
            "bball-silvermine",
            "--remote",
            "--file",
            str(ROOT / "worker/migrations/0015_brief_archive.sql"),
        ]
    )
    known = {
        r["sha256"]: r
        for r in selected(
            "brief_archive_objects",
            "sha256",
            capture.objects,
            "sha256,raw_size,content_type",
        )
    }
    bundle, objects = pack(capture, known)
    if bundle:
        verify_pack(bundle, objects)
        key = "bball-research/brief-archive/" + bundle.name
        cf(["r2", "object", "put", key, "--file", str(bundle), "--remote"])
        downloaded = WORK / "verified" / bundle.name
        downloaded.parent.mkdir(exist_ok=True)
        cf(["r2", "object", "get", key, "--file", str(downloaded), "--remote"])
        verify_pack(downloaded, objects)
    available = set(known) | {r["sha256"] for r in objects}
    for v in versions:
        if not {v["revision"], *json.loads(v["dependencies_json"])} <= available:
            raise ValueError("Archive dependency missing")
    sql = sql_insert("brief_archive_objects", objects) + sql_insert(
        "brief_archive_versions", versions
    )
    if any(len(line.encode()) > 95000 for line in sql.splitlines()):
        raise ValueError("Archive statement exceeds configured D1 bound")
    file = WORK / "capture.sql"
    file.write_text(sql)
    cf(["d1", "execute", "bball-silvermine", "--remote", "--file", str(file)])
    stored = {
        r["revision"]: r
        for r in selected(
            "brief_archive_versions", "revision", [v["revision"] for v in versions]
        )
    }
    for expected in versions:
        row = stored[expected["revision"]]
        # First raw Next.js HTML hash is retained; build IDs can change without
        # changing the standalone reading snapshot.
        for key, value in expected.items():
            if key != "original_html_sha256" and row[key] != value:
                raise ValueError(f"Stored archive metadata differs: {key}")
    stored_objects = {
        r["sha256"]: r
        for r in selected(
            "brief_archive_objects", "sha256", [r["sha256"] for r in objects]
        )
    }
    for expected in objects:
        if any(
            stored_objects[expected["sha256"]][key] != value
            for key, value in expected.items()
        ):
            raise ValueError("Stored archive range differs")
    manifest = {
        "pages": len(versions),
        "new_objects": len(objects),
        "bundle": bundle.name if bundle else None,
        "versions": versions,
        "objects": objects,
    }
    (WORK / "last-capture.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(
        json.dumps(
            {
                "archived_pages": len(versions),
                "new_objects": len(objects),
                "bundle": manifest["bundle"],
            }
        )
    )


if __name__ == "__main__":
    main()
