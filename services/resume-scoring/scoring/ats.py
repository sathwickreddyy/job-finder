"""The resume-ats-optimizer rubric as code: required-term coverage plus layout checks.

Only checks pdfplumber can establish are reported as passing; anything it cannot determine is a
warning, never a pass. Like the lexical scores, this is a tool diagnostic, not an employer ATS.
"""

import re
from collections import Counter
from io import BytesIO

import pdfplumber
from pydantic import BaseModel

from scoring.engine import ENGINE_VERSION, occurrences, uncertain_context
from scoring.extraction import extract_pdf
from scoring.models import Document, Metadata

TARGET = 80
METHOD = f"ats_optimizer@{ENGINE_VERSION}: required terms found ÷ required terms × 100"

HEADINGS = {
    "summary": {"summary", "professional summary"},
    "skills": {"skills", "technical skills", "core skills"},
    "experience": {"experience", "work experience", "professional experience", "employment"},
    # Recognised so a term under them is not counted in an earlier section.
    "other": {"education", "projects", "certifications", "awards", "publications"},
}
STANDARD_FONTS = ("arial", "helvetica", "calibri", "georgia", "timesnewroman", "times")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE = re.compile(r"(?<![\d+])\+?\d[\d\s\-()]{8,16}\d(?!\d)")
YEAR_RANGE = re.compile(r"^(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}$")
FILE_NAME = re.compile(r"^[A-Za-z]+_[A-Za-z]+.*resume.*\.pdf$", re.IGNORECASE)


class LayoutFacts(BaseModel):
    fonts: list[str]
    body_size: float | None
    images: int
    tables: int
    multi_column: bool
    # Most lines start at one left margin and none splits into two blocks.
    single_column: bool
    pages: int


def has_phone(text: str) -> bool:
    """10–13 digits that aren't a year range such as "2019 - 2023"."""
    for match in PHONE.finditer(text):
        candidate = match.group().strip()
        digits = sum(c.isdigit() for c in candidate)
        if 10 <= digits <= 13 and not YEAR_RANGE.match(candidate):
            return True
    return False


def layout_facts(data: bytes) -> LayoutFacts:
    fonts: set[str] = set()
    sizes: Counter[float] = Counter()
    images = tables = indented = split = lines = 0
    with pdfplumber.open(BytesIO(data)) as pdf:
        for page in pdf.pages:
            for char in page.chars:
                # Subset fonts are named like "ABCDEF+Calibri-Bold".
                fonts.add(char["fontname"].split("+")[-1])
                sizes[round(char["size"] * 2) / 2] += 1
            images += len(page.images)
            tables += len(page.find_tables())
            rows: dict[int, list[dict]] = {}
            for word in page.extract_words():
                rows.setdefault(round(word["top"]), []).append(word)
            for words in rows.values():
                words.sort(key=lambda w: w["x0"])
                lines += 1
                if words[0]["x0"] > page.width * 0.25:
                    indented += 1
                # A wide gap followed by text in the middle of the page is a second column;
                # right-aligned dates start near the right margin and don't count.
                if any(
                    b["x0"] - a["x1"] > 40 and page.width * 0.25 < b["x0"] < page.width * 0.7
                    for a, b in zip(words, words[1:], strict=False)
                ):
                    split += 1
        pages = len(pdf.pages)
    return LayoutFacts(
        fonts=sorted(fonts),
        body_size=sizes.most_common(1)[0][0] if sizes else None,
        images=images,
        tables=tables,
        multi_column=lines > 0 and (indented + split) / lines > 0.25,
        single_column=lines > 0 and indented / lines < 0.2 and split / lines < 0.1,
        pages=pages,
    )


def heading_of(line: str) -> str | None:
    key = line.strip().rstrip(":").casefold()
    return next((section for section, names in HEADINGS.items() if key in names), None)


def sections(text: str) -> list[tuple[int, str]]:
    """(offset where a section starts, section name); text before any heading is the summary."""
    result = [(0, "summary")]
    offset = 0
    for line in text.split("\n"):
        section = heading_of(line)
        if section:
            result.append((offset, section))
        offset += len(line) + 1
    return result


def section_at(starts: list[tuple[int, str]], position: int) -> str:
    return next(name for offset, name in reversed(starts) if offset <= position)


def item(check: str, ok: bool, detail: str, warn: bool = False) -> dict:
    return {"check": check, "ok": ok, "warn": warn, "detail": detail}


def unknown(check: str) -> dict:
    return item(check, False, "Could not be determined from this input.", warn=True)


def format_checks(document: Document, facts: LayoutFacts | None, filename: str | None) -> list:
    found = {heading_of(line) for line in document.text.split("\n")} - {None, "other"}
    checks = [
        item(
            "Text-based PDF",
            document.complete and bool(document.text.strip()),
            "Every page has extractable text."
            if document.complete
            else "Some pages have no extractable text; they may be scanned.",
        ),
        item(
            "Standard section headings",
            "experience" in found and len(found) >= 2,
            f"Found: {', '.join(sorted(found))}." if found else "No standard headings found.",
        ),
        item(
            "Contact details in the body",
            bool(EMAIL.search(document.text) and has_phone(document.text)),
            "Email and phone number appear in the text."
            if EMAIL.search(document.text) and has_phone(document.text)
            else "An email address or phone number was not found in the text.",
        ),
    ]
    if facts is None:
        checks += [
            unknown(name)
            for name in ("Standard fonts", "Body font size 10–12 pt", "No tables", "No images")
        ]
        checks.append(unknown("Single column"))
    else:
        others = [
            f
            for f in facts.fonts
            if not f.replace(" ", "").replace("-", "").casefold().startswith(STANDARD_FONTS)
        ]
        checks += [
            item("Standard fonts", True, f"Fonts: {', '.join(facts.fonts)}.")
            if not others
            else item(
                "Standard fonts", False, f"Not on the standard list: {', '.join(others)}.", True
            ),
            item(
                "Body font size 10–12 pt",
                facts.body_size is not None and 10 <= facts.body_size <= 12,
                f"Most text is {facts.body_size} pt." if facts.body_size else "No text found.",
            ),
            item("No tables", False, f"{facts.tables} ruled table(s) found.")
            if facts.tables
            else item(
                "No tables",
                False,
                "No ruled tables found; borderless tables can't be detected.",
                warn=True,
            ),
            item("No images", facts.images == 0, f"{facts.images} image(s) found."),
            item(
                "Single column",
                False,
                "Many lines split into two blocks or start mid-page, like a second column.",
            )
            if facts.multi_column
            else item("Single column", True, "Lines start at one left margin.")
            if facts.single_column
            else item("Single column", False, "The layout couldn't be read as one column.", True),
        ]
    if filename is None:
        checks.append(unknown("File name"))
    elif FILE_NAME.match(filename):
        checks.append(item("File name", True, f"{filename} follows FirstName_LastName_Resume.pdf."))
    else:
        checks.append(
            item(
                "File name",
                False,
                f"{filename} doesn't follow FirstName_LastName_Resume.pdf.",
                True,
            )
        )
    return checks


def ats_optimizer(
    document: Document, facts: LayoutFacts | None, metadata: Metadata, filename: str | None
) -> dict:
    starts = sections(document.text)
    keywords = []
    for req in metadata.requirements or []:
        if req.importance not in ("required", "preferred"):
            continue
        matches = occurrences(document.text, [req.term, *req.aliases])
        positive = [span for span in matches if not uncertain_context(document.text, span)]
        where = {"summary": 0, "skills": 0, "experience": 0}
        for span in positive:
            section = section_at(starts, span.start)
            if section in where:
                where[section] += 1
        keywords.append(
            {
                "term": req.term,
                "importance": req.importance,
                "found": len(positive),
                "unclear": bool(matches) and not positive,
                "where": where,
            }
        )
    required = [k for k in keywords if k["importance"] == "required"]
    found = sum(1 for k in required if k["found"] > 0)
    return {
        "engine_version": ENGINE_VERSION,
        "match_score": round(100 * found / len(required), 1) if required else 0.0,
        "target": TARGET,
        "method": METHOD,
        "format": format_checks(document, facts, filename),
        "keywords": keywords,
    }


def calculate_ats(data: bytes, metadata: dict, filename: str | None) -> dict:
    """Picklable process entry point. No networking, persistence or external submissions."""
    return ats_optimizer(
        extract_pdf(data), layout_facts(data), Metadata.model_validate(metadata), filename
    )
