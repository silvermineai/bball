"""Bound SQL statements for staging large artifact manifests before activation."""

import uuid


def quote(value):
    return "'" + value.replace("'", "''") + "'"


def manifest_statements(name, observed_at, payload):
    # The caller verifies the fully reconstructed staging payload before activating.
    stage = f"{name}-stage-{uuid.uuid4().hex}"
    chunks = [payload[i : i + 20000] for i in range(0, len(payload), 20000)] or [""]
    statements = [
        "INSERT INTO football_artifacts (name,generated_at,payload_json) VALUES ("
        + ",".join(map(quote, [stage, observed_at, chunks[0]]))
        + ")"
    ]
    statements.extend(
        "UPDATE football_artifacts SET payload_json=payload_json||"
        + quote(chunk)
        + " WHERE name="
        + quote(stage)
        for chunk in chunks[1:]
    )
    activate = (
        "INSERT OR REPLACE INTO football_artifacts (name,generated_at,payload_json) "
        + "SELECT "
        + quote(name)
        + ",generated_at,payload_json FROM football_artifacts WHERE name="
        + quote(stage)
    )
    cleanup = "DELETE FROM football_artifacts WHERE name=" + quote(stage)
    # A Unicode character has at most four UTF-8 bytes; doubled SQL quotes at most two.
    if max(len(s.encode()) for s in [*statements, activate, cleanup]) >= 100000:
        raise ValueError("Artifact SQL statement is too large")
    return stage, statements, activate, cleanup
