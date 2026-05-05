"""Daily shortlist markdown generator."""
from __future__ import annotations

from pathlib import Path

from ..models import Priority, ScoredJob
from ..utils import truncate, utcnow_iso


def _fmt_job(s: ScoredJob) -> str:
    loc = s.job.location or "—"
    remote = f" ({s.job.remote_type})" if s.job.remote_type else ""
    reasons = "; ".join(s.reasons) or "—"
    missing = ", ".join(s.missing_skills) or "—"
    variant = s.recommended_resume_variant or "—"
    return (
        f"### {s.job.role} — {s.job.company}\n"
        f"- **Fit Score:** {s.fit_score}\n"
        f"- **Location:** {loc}{remote}\n"
        f"- **URL:** {s.job.url}\n"
        f"- **Why it fits:** {reasons}\n"
        f"- **Missing gaps:** {missing}\n"
        f"- **Recommended resume variant:** `{variant}`\n"
        f"- **Next action:** {s.next_action}\n"
    )


def _section(title: str, scored: list[ScoredJob]) -> str:
    if not scored:
        return f"## {title}\n\n_(none)_\n\n"
    body = "\n".join(_fmt_job(s) for s in scored)
    return f"## {title}\n\n{body}\n\n"


def render_shortlist(scored: list[ScoredJob]) -> str:
    p0 = [s for s in scored if s.priority == Priority.P0]
    p1 = [s for s in scored if s.priority == Priority.P1]
    p2 = [s for s in scored if s.priority == Priority.P2]
    ignored = [s for s in scored if s.priority == Priority.IGNORE]

    header = f"# Today's Apply Queue\n\n_Generated {utcnow_iso()}_\n\n"
    summary = (
        f"**Counts:** P0={len(p0)} · P1={len(p1)} · P2={len(p2)} · Ignored={len(ignored)}\n\n"
    )
    body = (
        _section("P0 Roles", p0)
        + _section("P1 Roles", p1)
        + _section("P2 Backup Roles", p2)
        + _ignored_summary(ignored)
    )
    return header + summary + body


def _ignored_summary(scored: list[ScoredJob]) -> str:
    if not scored:
        return "## Ignored Summary\n\n_(none)_\n"
    lines = [
        f"- {s.job.role} @ {s.job.company} "
        f"(score {s.fit_score}) — {truncate('; '.join(s.risks) or 'below threshold', 140)}"
        for s in scored[:30]
    ]
    more = f"\n\n_({len(scored) - 30} more)_" if len(scored) > 30 else ""
    return "## Ignored Summary\n\n" + "\n".join(lines) + more + "\n"


def write_shortlist(scored: list[ScoredJob], path: Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_shortlist(scored), encoding="utf-8")
    return path
