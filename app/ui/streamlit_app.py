"""Local Streamlit control panel for job-search-agent.

Intentionally stateless — every page re-reads config and store on render
so we never show stale YAML. No authentication (assumes local trusted use).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import streamlit as st
import yaml

from app.config import load_settings
from app.config_repo import (
    COMPANIES_YAML,
    MANUAL_JOBS_YAML,
    PROFILE_YAML,
    SCORING_YAML,
    SOURCES_YAML,
    ReadOnlyRepositoryError,
    build_config_repository,
)
from app.storage import build_store


st.set_page_config(page_title="job-search-agent", layout="wide")


def _repo_badge(repo) -> None:
    if repo.is_read_only:
        st.warning(
            "Config backend is **read-only** (CONFIG_BACKEND=http). "
            "Save buttons are disabled. Switch to `local` to edit config on disk."
        )
    else:
        st.caption(f"Config backend: **local** — editing `{repo.config_dir}`")


def _save_yaml_safe(repo, filename: str, text: str) -> bool:
    try:
        parsed = yaml.safe_load(text)
        if parsed is None:
            parsed = {}
        if not isinstance(parsed, dict):
            st.error("Top-level must be a YAML mapping.")
            return False
        repo.save_yaml(filename, parsed)
        st.success(f"Saved `{filename}`.")
        return True
    except yaml.YAMLError as e:
        st.error(f"Invalid YAML: {e}")
        return False
    except ReadOnlyRepositoryError as e:
        st.error(str(e))
        return False
    except Exception as e:  # noqa: BLE001
        st.error(f"Failed to save: {e}")
        return False


def page_dashboard() -> None:
    settings = load_settings()
    store = build_store(settings)
    store.init_schema()

    st.title("Dashboard")
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total jobs", store.total_jobs())

    counts = store.count_by_priority()
    col2.metric("P0", counts.get("P0", 0))
    col3.metric("P1", counts.get("P1", 0))
    col4.metric("P2", counts.get("P2", 0))

    st.caption(f"Last run: {store.last_run_at() or 'never'}")

    st.subheader("Shortlist preview")
    shortlist_path = Path("data/shortlist.md")
    if shortlist_path.exists():
        st.markdown(shortlist_path.read_text(encoding="utf-8"))
    else:
        st.info("No shortlist yet. Run `python -m app.main run-daily`.")


def _edit_yaml_page(title: str, filename: str) -> None:
    settings = load_settings()
    repo = build_config_repository(settings)
    _repo_badge(repo)
    st.title(title)

    current = repo.load_yaml(filename)
    text_default = yaml.safe_dump(current or {}, sort_keys=False, allow_unicode=True)
    text = st.text_area(
        f"`{filename}` (YAML)",
        value=text_default,
        height=500,
        key=f"yaml_{filename}",
    )
    save_disabled = repo.is_read_only
    if st.button("Save", disabled=save_disabled, key=f"save_{filename}"):
        _save_yaml_safe(repo, filename, text)


def page_profile() -> None:
    _edit_yaml_page("Profile Config", PROFILE_YAML)


def page_companies() -> None:
    _edit_yaml_page("Companies Config", COMPANIES_YAML)


def page_scoring() -> None:
    _edit_yaml_page("Scoring Config", SCORING_YAML)


def page_sources() -> None:
    _edit_yaml_page("Sources Config", SOURCES_YAML)


def page_resume_variants() -> None:
    settings = load_settings()
    repo = build_config_repository(settings)
    _repo_badge(repo)
    st.title("Resume Variants")

    profile = repo.load_yaml(PROFILE_YAML)
    variants = profile.get("resume_variants") or []
    if not variants:
        st.info("No `resume_variants` configured in profile.yaml.")
        return

    for v in variants:
        name = v.get("name", "?")
        path = v.get("path", "")
        with st.expander(f"{name} — `{path}`", expanded=False):
            content = repo.load_resume(path) if path else ""
            if not content:
                st.warning(f"Missing resume file: `{path}`")
            else:
                st.markdown(content)


def page_manual_jobs() -> None:
    settings = load_settings()
    repo = build_config_repository(settings)
    _repo_badge(repo)
    st.title("Manual Jobs")

    current = repo.load_yaml(MANUAL_JOBS_YAML) or {"jobs": []}
    existing = current.get("jobs") or []
    st.caption(f"{len(existing)} manual job(s) currently saved.")

    with st.expander("Add a new manual job", expanded=True):
        with st.form("add_manual_job", clear_on_submit=True):
            role = st.text_input("Role")
            company = st.text_input("Company")
            url = st.text_input("URL (LinkedIn / Naukri / recruiter post / WhatsApp link…)")
            location = st.text_input("Location", "Bengaluru")
            source = st.selectbox(
                "Source",
                ["linkedin", "naukri", "recruiter", "whatsapp", "telegram", "other"],
                index=0,
            )
            posted_date = st.text_input("Posted date (YYYY-MM-DD, optional)", "")
            description = st.text_area("Paste JD / description", height=220)
            notes = st.text_area("Notes (referral contact, recruiter name, etc.)", height=80)
            submitted = st.form_submit_button(
                "Add to manual_jobs.yaml", disabled=repo.is_read_only
            )
        if submitted and not repo.is_read_only:
            if not role or not company:
                st.error("Role and Company are required.")
            else:
                entry = {
                    "role": role.strip(),
                    "company": company.strip(),
                    "url": url.strip(),
                    "source": source,
                    "location": location.strip() or None,
                    "posted_date": posted_date.strip() or None,
                    "description": description.strip() or None,
                    "notes": notes.strip() or None,
                }
                existing.append(entry)
                repo.save_yaml(MANUAL_JOBS_YAML, {"jobs": existing})
                st.success(f"Saved. Total manual jobs: {len(existing)}")

    st.subheader("Currently saved")
    if not existing:
        st.info("No manual jobs yet.")
    else:
        for i, e in enumerate(existing):
            with st.expander(f"{e.get('role', '?')} — {e.get('company', '?')}", expanded=False):
                st.json(e)
                if not repo.is_read_only and st.button("Remove", key=f"del_{i}"):
                    existing.pop(i)
                    repo.save_yaml(MANUAL_JOBS_YAML, {"jobs": existing})
                    st.rerun()


def page_shortlist() -> None:
    st.title("Shortlist Preview")
    p = Path("data/shortlist.md")
    if not p.exists():
        st.info("No shortlist generated yet. Run `python -m app.main run-daily`.")
        return
    st.markdown(p.read_text(encoding="utf-8"))


def page_run_actions() -> None:
    st.title("Run Actions")
    st.caption("These commands run the CLI in a subprocess using the current venv Python.")

    def _run(cmd: list[str]) -> None:
        st.code("$ " + " ".join(cmd))
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.stdout:
            st.text(proc.stdout)
        if proc.stderr:
            st.text(proc.stderr)
        if proc.returncode == 0:
            st.success("OK")
        else:
            st.error(f"Exit {proc.returncode}")

    py = sys.executable
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        if st.button("collect"):
            _run([py, "-m", "app.main", "collect"])
    with col2:
        if st.button("run-daily"):
            _run([py, "-m", "app.main", "run-daily"])
    with col3:
        if st.button("export-json"):
            _run([py, "-m", "app.main", "export-json"])
    with col4:
        if st.button("sync-notion"):
            _run([py, "-m", "app.main", "sync-notion"])


PAGES = {
    "Dashboard": page_dashboard,
    "Profile Config": page_profile,
    "Companies Config": page_companies,
    "Scoring Config": page_scoring,
    "Sources Config": page_sources,
    "Resume Variants": page_resume_variants,
    "Manual Jobs": page_manual_jobs,
    "Shortlist Preview": page_shortlist,
    "Run Actions": page_run_actions,
}


def main() -> None:
    st.sidebar.title("job-search-agent")
    page = st.sidebar.radio("Navigate", list(PAGES.keys()))
    PAGES[page]()


if __name__ == "__main__":
    main()
