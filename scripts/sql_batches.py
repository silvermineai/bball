"""Small, deterministic SQL-file batching helpers for remote D1 imports."""

from pathlib import Path


# Wrangler reports this reset after Cloudflare rolls a failed remote import
# back to its starting bookmark. The rollback is explicitly safe to retry, so
# keep the marker in one place for every publisher that writes D1 in batches.
RETRYABLE_D1_IMPORT_MARKERS = (
    "upstream service unavailable",
    "code: 7009",
    "currently processing a long-running import",
    "cancelled due to no poll() received",
    "d1 db reset because its code was updated",
    "db reset because its code was updated",
    "d1 db storage operation exceeded timeout",
    "storage operation exceeded timeout",
    "not currently importing anything",
    "connection closed",
    "no longer active",
)


def is_retryable_d1_import_error(output: str) -> bool:
    """Return whether Wrangler's output describes a safe remote retry."""
    lowered = output.lower()
    return any(marker in lowered for marker in RETRYABLE_D1_IMPORT_MARKERS)


def split_sql_file(source: str | Path, chunk_dir: str | Path, max_bytes: int = 900_000) -> list[Path]:
    """Split an export into bounded DELETE and INSERT statement files.

    Exporters in this repository write scoped DELETE statements before their
    INSERT statements. Keeping each DELETE separate makes a failed replay
    recoverable: a retry starts by clearing the same scope before reloading
    rows. The returned paths are ordered for execution.
    """
    source_path = Path(source)
    if not source_path.exists():
        raise FileNotFoundError(source_path)
    if max_bytes < 1:
        raise ValueError("max_bytes must be positive")
    destination = Path(chunk_dir)
    destination.mkdir(parents=True, exist_ok=True)
    for old in destination.glob("*.sql"):
        old.unlink()
    delete_paths: list[Path] = []
    insert_paths: list[Path] = []
    current: list[bytes] = []
    current_bytes = 0
    for line in source_path.read_bytes().splitlines(keepends=True):
        if line.lstrip().startswith(b"DELETE "):
            target = destination / f"delete-{len(delete_paths):04d}.sql"
            target.write_bytes(line)
            delete_paths.append(target)
            continue
        if current and current_bytes + len(line) > max_bytes:
            target = destination / f"insert-{len(insert_paths):04d}.sql"
            target.write_bytes(b"".join(current))
            insert_paths.append(target)
            current, current_bytes = [], 0
        current.append(line)
        current_bytes += len(line)
    if current:
        target = destination / f"insert-{len(insert_paths):04d}.sql"
        target.write_bytes(b"".join(current))
        insert_paths.append(target)
    return delete_paths + insert_paths
