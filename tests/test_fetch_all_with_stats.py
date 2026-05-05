"""Source selection semantics for fetch_all_with_stats.

Absence of a source key in ``sources_cfg`` must mean "skip"; presence with
``enabled=False`` falls to the source's own early-return (kept==0). This
prevents the "select only ycombinator" UX from still running remotive."""
from __future__ import annotations

from unittest.mock import patch

from app.sources import fetch_all, fetch_all_with_stats


class _Repo:
    def load_yaml(self, _filename: str) -> dict:
        return {}


def test_only_selected_sources_run() -> None:
    with patch("app.sources.RemotiveSource.fetch", return_value=[]) as remo, \
         patch("app.sources.YCombinatorSource.fetch", return_value=[]) as yc, \
         patch("app.sources.GreenhouseSource.fetch", return_value=[]) as gh, \
         patch("app.sources.AshbySource.fetch", return_value=[]) as ashby, \
         patch("app.sources.LeverSource.fetch", return_value=[]) as lever, \
         patch("app.sources.ManualSource.fetch", return_value=[]) as manual:
        jobs, stats = fetch_all_with_stats(
            _Repo(),
            sources_cfg={"ycombinator": {"enabled": True}},
            companies_cfg={"companies": []},
        )
    assert jobs == []
    assert set(stats.keys()) == {"ycombinator"}
    assert yc.called
    assert not remo.called
    assert not gh.called
    assert not ashby.called
    assert not lever.called
    assert not manual.called


def test_all_sources_run_when_all_keys_present() -> None:
    cfg = {
        "manual": {"enabled": True},
        "remotive": {"enabled": True},
        "greenhouse": {"enabled": True},
        "ashby": {"enabled": True},
        "ycombinator": {"enabled": True},
        "lever": {"enabled": True},
    }
    with patch("app.sources.RemotiveSource.fetch", return_value=[]), \
         patch("app.sources.YCombinatorSource.fetch", return_value=[]), \
         patch("app.sources.GreenhouseSource.fetch", return_value=[]), \
         patch("app.sources.AshbySource.fetch", return_value=[]), \
         patch("app.sources.LeverSource.fetch", return_value=[]), \
         patch("app.sources.ManualSource.fetch", return_value=[]):
        _, stats = fetch_all_with_stats(
            _Repo(), sources_cfg=cfg, companies_cfg={"companies": []}
        )
    assert set(stats.keys()) == {
        "manual",
        "remotive",
        "greenhouse",
        "ashby",
        "ycombinator",
        "lever",
    }


def test_empty_sources_cfg_runs_nothing() -> None:
    """Selecting no sources is a no-op — not a default-all."""
    _, stats = fetch_all_with_stats(
        _Repo(), sources_cfg={}, companies_cfg={"companies": []}
    )
    assert stats == {}


def test_fetch_all_also_skips_absent_source_keys() -> None:
    with patch("app.sources.RemotiveSource.fetch", return_value=[]) as remo, \
         patch("app.sources.YCombinatorSource.fetch", return_value=[]) as yc, \
         patch("app.sources.GreenhouseSource.fetch", return_value=[]) as gh, \
         patch("app.sources.AshbySource.fetch", return_value=[]) as ashby, \
         patch("app.sources.LeverSource.fetch", return_value=[]) as lever, \
         patch("app.sources.ManualSource.fetch", return_value=[]) as manual:
        jobs = fetch_all(
            _Repo(),
            sources_cfg={"manual": {"enabled": True}},
            companies_cfg={"companies": []},
        )
    assert jobs == []
    assert manual.called
    assert not remo.called
    assert not yc.called
    assert not gh.called
    assert not ashby.called
    assert not lever.called
