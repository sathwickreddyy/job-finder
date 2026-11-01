import json
import re
from hashlib import sha256

from scoring.catalog import SKILLS
from scoring.extraction import extract_pdf, text_document
from scoring.models import (
    Assessment,
    Document,
    Evidence,
    Finding,
    Metadata,
    Requirement,
    Score,
    Span,
)

ENGINE_VERSION = "1.0.0"
METHODS = [
    {
        "id": "keyword_coverage",
        "version": ENGINE_VERSION,
        "formula": "100 * distinct mentioned requirements / distinct requirements",
        "description": "Literal terms and declared aliases; repetition earns no extra points.",
    },
    {
        "id": "required_coverage",
        "version": ENGINE_VERSION,
        "formula": "keyword_coverage restricted to caller-labelled required requirements",
    },
    {
        "id": "preferred_coverage",
        "version": ENGINE_VERSION,
        "formula": "keyword_coverage restricted to caller-labelled preferred requirements",
    },
    {
        "id": "weighted_coverage",
        "version": ENGINE_VERSION,
        "formula": "100 * sum(weights of mentioned requirements) / sum(all requirement weights)",
        "weights": {"required": 3, "preferred": 1, "unspecified": 1},
    },
]
LIMITATIONS = [
    "These are lexical coverage scores, not employer ATS scores or interview probabilities.",
    "A mention does not establish proficiency, duration, seniority or demonstrated experience.",
    "Not evidenced means absent from this document, not absent from the candidate's skills.",
    "Semantic experience fit, practical fit and visual formatting quality are not scored.",
    "PDF extraction does not prove that another ATS parser will read the file correctly.",
]


def pattern(term: str) -> re.Pattern:
    # Unicode word boundaries plus technology punctuation prevent Java/JavaScript,
    # SQL/NoSQL and C/C++ false positives. No caller-supplied regular expressions.
    escaped = r"\s+".join(re.escape(part) for part in term.split())
    flags = 0 if term == "Go" else re.IGNORECASE
    return re.compile(r"(?<![\w+#])" + escaped + r"(?![\w+#])", flags)


def occurrences(text: str, terms: list[str]) -> list[Span]:
    candidates = {
        (match.start(), match.end()) for term in terms for match in pattern(term).finditer(text)
    }
    accepted: list[Span] = []
    # Prefer the longest alias when two expressions cover the same mention.
    for start, end in sorted(candidates, key=lambda pair: (pair[0], -(pair[1] - pair[0]))):
        if any(start < span.end and end > span.start for span in accepted):
            continue
        accepted.append(Span(start=start, end=end, text=text[start:end]))
    return accepted


def suggested_requirements(jd: str) -> list[Requirement]:
    result = []
    for term, aliases in SKILLS.items():
        found = occurrences(jd, [term, *aliases])
        if found:
            match = found[0]
            start = jd.rfind("\n", 0, match.start) + 1
            end = jd.find("\n", match.end)
            line = jd[start : end if end >= 0 else len(jd)]
            # A catalogue hit alone cannot tell a requirement from a company description.
            result.append(
                Requirement(
                    term=term,
                    aliases=list(aliases),
                    jd_quote=line[:2000] if len(line) <= 2000 else match.text,
                )
            )
    return result


def uncertain_context(text: str, span: Span) -> bool:
    start = max(text.rfind("\n", 0, span.start) + 1, span.start - 100)
    end = text.find("\n", span.end)
    context = text[start : end if end >= 0 else min(len(text), span.end + 100)]
    return bool(
        re.search(
            r"\b(no|not|without|never|lack|lacking|learning|beginner|aspiring)\b", context, re.I
        )
    )


def assess(document: Document, metadata: Metadata) -> Assessment:
    requirements = metadata.requirements or suggested_requirements(metadata.job_description)
    findings = []
    for req in requirements:
        quote_start = metadata.job_description.index(req.jd_quote)
        matches = occurrences(document.text, [req.term, *req.aliases])
        positive = [span for span in matches if not uncertain_context(document.text, span)]
        status = "mentioned" if positive else "unclear" if matches else "not_evidenced"
        if not document.complete:
            status = "unclear"
        explanation = {
            "mentioned": "The term or a declared alias appears; proficiency is unverified.",
            "not_evidenced": "No literal term or declared alias was found in the resume text.",
            "unclear": "Extraction or the surrounding text needs manual interpretation.",
        }[status]
        findings.append(
            Finding(
                term=req.term,
                aliases=req.aliases,
                importance=req.importance,
                status=status,
                jd_evidence=Span(
                    start=quote_start, end=quote_start + len(req.jd_quote), text=req.jd_quote
                ),
                resume_evidence=[
                    Evidence(
                        **span.model_dump(),
                        boxes=[
                            word.box
                            for word in document.words
                            if word.start < span.end and word.end > span.start
                        ],
                    )
                    for span in matches[:20]
                ],
                explanation=explanation,
                suggestion=(
                    None
                    if status == "mentioned"
                    else "Review this requirement. Add an example only from real experience."
                ),
            )
        )

    def score(key: str, label: str, subset: list[Finding], weighted: bool = False) -> Score:
        matched = sum(item.status == "mentioned" for item in subset)
        weights = [3 if weighted and item.importance == "required" else 1 for item in subset]
        value = None
        if subset and document.complete and not any(item.status == "unclear" for item in subset):
            numerator = sum(
                weight
                for item, weight in zip(subset, weights, strict=True)
                if item.status == "mentioned"
            )
            value = round(100 * numerator / sum(weights), 1)
        return Score(
            id=key,
            label=label,
            value=value,
            matched=matched,
            total=len(subset),
            method=f"{key}@{ENGINE_VERSION}",
        )

    scores = [
        score("keyword_coverage", "Keyword coverage", findings),
        score(
            "required_coverage",
            "Required keyword coverage",
            [item for item in findings if item.importance == "required"],
        ),
        score(
            "preferred_coverage",
            "Preferred keyword coverage",
            [item for item in findings if item.importance == "preferred"],
        ),
        score("weighted_coverage", "Weighted keyword coverage", findings, weighted=True),
    ]
    warnings = list(document.warnings)
    if metadata.requirements is None:
        warnings.append(
            "Requirements are unreviewed vocabulary suggestions. "
            "Review the JD and supply requirements with quotes to assess explicit criteria."
        )
    if not findings:
        warnings.append(
            "No known terms were found; supply reviewed requirements. Scores are unavailable."
        )
    if document.input_kind == "text":
        warnings.append("Text-only input: PDF readability and page highlights were not assessed.")
    status = "completed"
    if not document.complete or not findings:
        status = "unable_to_assess"
    elif metadata.requirements is None or any(item.status == "unclear" for item in findings):
        status = "needs_review"
    identity = json.dumps(
        {
            "engine": ENGINE_VERSION,
            "resume": document.sha256,
            "metadata": metadata.model_dump(),
        },
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return Assessment(
        assessment_id=sha256(identity.encode()).hexdigest(),
        engine_version=ENGINE_VERSION,
        requirement_source="caller_reviewed" if metadata.requirements else "catalog_suggestions",
        status=status,
        resume_version_id=metadata.resume_version_id,
        job_snapshot_id=metadata.job_snapshot_id,
        application_id=metadata.application_id,
        resume_sha256=document.sha256,
        jd_sha256=sha256(metadata.job_description.encode()).hexdigest(),
        input_kind=document.input_kind,
        scores=scores,
        findings=findings,
        resume_text=document.text,
        pages=document.pages,
        warnings=warnings,
        limitations=LIMITATIONS,
    )


def calculate(data: str | bytes, metadata: dict, input_kind: str) -> dict:
    """Picklable process entry point. No networking, persistence or external submissions."""
    document = extract_pdf(data) if input_kind == "pdf" else text_document(data)
    return assess(document, Metadata.model_validate(metadata)).model_dump()
