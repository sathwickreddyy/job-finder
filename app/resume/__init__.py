"""Resume tailoring + source resolution."""
from __future__ import annotations

from .source import ResumeBundle, read_resume
from .tailor import tailor

__all__ = ["tailor", "read_resume", "ResumeBundle"]
