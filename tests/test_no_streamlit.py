"""Fail if any app/ module still imports streamlit."""
import importlib
import pkgutil

import app as app_pkg


def test_streamlit_not_imported_by_app() -> None:
    failures: list[str] = []
    for mod_info in pkgutil.walk_packages(app_pkg.__path__, prefix="app."):
        try:
            importlib.import_module(mod_info.name)
        except ImportError as e:
            if "streamlit" in str(e).lower():
                failures.append(mod_info.name)
    assert failures == [], f"modules still importing streamlit: {failures}"
