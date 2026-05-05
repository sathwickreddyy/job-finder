"""Export store contents to JSON for debugging and backups."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .sqlite_store import SQLiteStore


def export_all(store: SQLiteStore, out_dir: Path) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = out_dir / f"export_{ts}.json"

    scored = store.get_scored_jobs()
    payload = {
        "exported_at": ts,
        "total_jobs": store.total_jobs(),
        "count_by_priority": store.count_by_priority(),
        "scored_jobs": [s.model_dump() for s in scored],
    }
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return out_path
