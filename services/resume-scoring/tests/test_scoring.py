from io import BytesIO

import pytest
from pydantic import ValidationError
from reportlab.lib.pdfencrypt import StandardEncryption
from reportlab.pdfgen import canvas

from scoring.engine import assess, occurrences
from scoring.extraction import DocumentError, extract_pdf, text_document
from scoring.models import Metadata, Requirement


def make_pdf(lines=None, *, pages=1, encrypt=None):
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=(600, 800), encrypt=encrypt)
    for _ in range(pages):
        for index, line in enumerate(lines or []):
            pdf.drawString(50, 740 - index * 20, line)
        pdf.showPage()
    pdf.save()
    return output.getvalue()


def metadata():
    return Metadata(
        job_description="Required: Python and SQL. Preferred: Docker.",
        requirements=[
            Requirement(term="Python", importance="required", jd_quote="Required: Python and SQL."),
            Requirement(term="SQL", importance="required", jd_quote="Required: Python and SQL."),
            Requirement(term="Docker", importance="preferred", jd_quote="Preferred: Docker."),
        ],
        application_id="application-a",
        resume_version_id="version-a",
        job_snapshot_id="snapshot-a",
    )


def values(result):
    return {score.id: score.value for score in result.scores}


def test_scores_have_distinct_meanings_and_repetition_earns_nothing():
    result = assess(text_document("Built services with Python and Docker."), metadata())
    assert values(result) == {
        "keyword_coverage": 66.7,
        "required_coverage": 50,
        "preferred_coverage": 100,
        "weighted_coverage": 57.1,
    }
    repeated = assess(text_document("Python Python Python Docker Docker"), metadata())
    assert values(repeated) == values(result)
    assert result.findings[1].status == "not_evidenced"
    assert "candidate" in result.limitations[2]


def test_technology_boundaries_aliases_unicode_and_literal_regex():
    assert not occurrences("JavaScript NoSQL C++", ["Java", "SQL", "C"])
    assert occurrences("Built C++ and C# apps", ["C++", "C#"])
    assert occurrences("Amazon\nWeb Services", ["AWS", "Amazon Web Services"])
    assert not occurrences("go to the office", ["Go"])
    assert occurrences("Built services in Go", ["Go"])
    assert not occurrences("anything", [".*"])
    value = "👋 Built Python services"
    span = occurrences(value, ["Python"])[0]
    assert value[span.start : span.end] == "Python"


def test_aliases_collapse_overlapping_mentions():
    spans = occurrences("Apache Kafka, Kafka", ["Kafka", "Apache Kafka"])
    assert [span.text for span in spans] == ["Apache Kafka", "Kafka"]


def test_unknowns_and_negated_mentions_never_get_an_invented_score():
    result = assess(text_document("Python and Docker.\nNo SQL experience."), metadata())
    assert result.status == "needs_review"
    assert result.findings[1].status == "unclear"
    assert values(result)["required_coverage"] is None
    assert values(result)["preferred_coverage"] == 100
    unknown = assess(text_document("A resume."), Metadata(job_description="A bespoke discipline."))
    assert unknown.status == "unable_to_assess"
    assert all(score.value is None for score in unknown.scores)


def test_suggested_requirements_are_explicitly_unreviewed():
    result = assess(
        text_document("Built Python services"), Metadata(job_description="We use Python.")
    )
    assert result.status == "needs_review"
    assert result.requirement_source == "catalog_suggestions"
    assert values(result)["required_coverage"] is None
    assert result.findings[0].importance == "unspecified"


def test_quote_validation_and_duplicate_requirements():
    with pytest.raises(ValidationError):
        Metadata(
            job_description="Python",
            requirements=[Requirement(term="Python", jd_quote="not in the JD")],
        )
    req = Requirement(term="Python", jd_quote="Python")
    with pytest.raises(ValidationError):
        Metadata(job_description="Python", requirements=[req, req])
    with pytest.raises(ValidationError):
        Metadata(job_description=" ")


def test_identity_changes_with_inputs_version_references_and_rubric():
    doc = text_document("Built Python services")
    source = metadata()
    first = assess(doc, source)
    assert first.assessment_id == assess(doc, source).assessment_id
    assert first.assessment_id != assess(text_document("Built SQL services"), source).assessment_id
    source.requirements[0].importance = "preferred"
    assert first.assessment_id != assess(doc, source).assessment_id
    source.resume_version_id = "version-b"
    assert first.assessment_id != assess(doc, source).assessment_id
    assert first.resume_version_id == "version-a"
    assert first.job_snapshot_id == "snapshot-a"


def test_pdf_highlights_reference_exact_text_on_correct_page():
    doc = extract_pdf(
        make_pdf(
            [
                "Synthetic Candidate - Software Engineer",
                "Built Python and SQL services with Docker.",
            ],
            pages=2,
        )
    )
    result = assess(doc, metadata())
    assert result.status == "completed"
    assert all(score.value == 100 for score in result.scores)
    evidence = result.findings[0].resume_evidence
    assert [entry.boxes[0].page for entry in evidence] == [1, 2]
    for entry in evidence:
        assert doc.text[entry.start : entry.end] == "Python"
        for box in entry.boxes:
            assert 0 <= box.x0 < box.x1 <= 600
            assert 0 <= box.top < box.bottom <= 800
    jd = result.findings[0].jd_evidence
    assert metadata().job_description[jd.start : jd.end] == jd.text


def test_blank_partial_corrupt_encrypted_and_oversized_pdfs():
    blank = assess(extract_pdf(make_pdf()), metadata())
    assert blank.status == "unable_to_assess"
    assert all(score.value is None for score in blank.scores)
    output = BytesIO()
    pdf = canvas.Canvas(output)
    pdf.drawString(40, 700, "Synthetic Candidate with Python, SQL and Docker experience")
    pdf.showPage()
    pdf.showPage()
    pdf.save()
    assert not extract_pdf(output.getvalue()).complete
    for data in (
        b"not a PDF",
        b"%PDF-corrupt",
        make_pdf(pages=13),
        make_pdf(["Private"], encrypt=StandardEncryption("secret")),
        b"%PDF-" + b"x" * (10 * 1024 * 1024),
    ):
        with pytest.raises(DocumentError):
            extract_pdf(data)
