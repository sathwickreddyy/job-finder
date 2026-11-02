from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from scoring import api
from scoring.ats import ats_optimizer, layout_facts
from scoring.extraction import extract_pdf, text_document
from scoring.models import Metadata, Requirement

JD = "Must have Java, Kafka and Spark.\nNice to have: Docker."
QUOTE_REQUIRED = "Must have Java, Kafka and Spark."
QUOTE_PREFERRED = "Nice to have: Docker."

RESUME = [
    "Asha Example",
    "asha@example.com | +91 98765 43210 | Bengaluru",
    "PROFESSIONAL SUMMARY",
    "Backend engineer building Java services.",
    "SKILLS",
    "Java, Spark, Docker",
    "PROFESSIONAL EXPERIENCE",
    "Built Java pipelines at Example Corp.",
    "EDUCATION",
    "B.Tech, Example University",
]


def make_pdf(lines, *, font="Helvetica", size=11, image=False):
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=(600, 800))
    pdf.setFont(font, size)
    for index, line in enumerate(lines):
        pdf.drawString(50, 740 - index * 20, line)
    if image:
        picture = BytesIO()
        Image.new("RGB", (20, 20), "black").save(picture, format="PNG")
        picture.seek(0)
        pdf.drawImage(ImageReader(picture), 400, 700, 20, 20)
    pdf.showPage()
    pdf.save()
    return output.getvalue()


def requirements(required=("Java", "Kafka", "Spark"), preferred=("Docker",)):
    return [
        Requirement(term=t, importance="required", jd_quote=QUOTE_REQUIRED) for t in required
    ] + [Requirement(term=t, importance="preferred", jd_quote=QUOTE_PREFERRED) for t in preferred]


def run(lines, *, filename="Asha_Example_Resume.pdf", reqs=None, data=None, **pdf_options):
    data = data or make_pdf(lines, **pdf_options)
    metadata = Metadata(job_description=JD, requirements=reqs or requirements())
    return ats_optimizer(extract_pdf(data), layout_facts(data), metadata, filename)


def check(result, name):
    return next(item for item in result["format"] if item["check"] == name)


def test_match_score_counts_required_only():
    # Java and Spark present, Kafka absent; Docker (preferred) is ignored by the formula.
    result = run(RESUME)
    assert result["match_score"] == 66.7
    assert result["target"] == 80
    assert result["method"].startswith("ats_optimizer@1.1.0")


def test_negated_mention_not_found_and_unclear():
    result = run([*RESUME, "No Kafka experience yet."])
    kafka = next(k for k in result["keywords"] if k["term"] == "Kafka")
    assert kafka["found"] == 0
    assert kafka["unclear"] is True
    assert result["match_score"] == 66.7


def test_where_counts_by_section():
    result = run(RESUME)
    java = next(k for k in result["keywords"] if k["term"] == "Java")
    assert java["where"] == {"summary": 1, "skills": 1, "experience": 1}
    assert java["found"] == 3
    assert java["importance"] == "required"
    assert java["unclear"] is False


def test_format_checks_pass_on_a_plain_single_column_pdf():
    result = run(RESUME)
    for name in (
        "Text-based PDF",
        "Standard section headings",
        "Contact details in the body",
        "Standard fonts",
        "Body font size 10–12 pt",
        "No images",
        "Single column",
        "File name",
    ):
        item = check(result, name)
        assert item["ok"] is True, (name, item)
        assert item["detail"]


def test_format_check_fails_on_an_image():
    item = check(run(RESUME, image=True), "No images")
    assert item["ok"] is False
    assert not item.get("warn")


def test_format_check_fails_without_standard_headings():
    lines = [line for line in RESUME if line.isupper() is False]
    item = check(run(lines), "Standard section headings")
    assert item["ok"] is False


def test_file_name_without_the_pattern_warns():
    item = check(run(RESUME, filename="resume.pdf"), "File name")
    assert item["ok"] is False
    assert item["warn"] is True


def test_unlisted_font_warns_never_passes():
    item = check(run(RESUME, font="Courier"), "Standard fonts")
    assert item["ok"] is False
    assert item["warn"] is True


def test_text_input_cannot_establish_layout_checks():
    metadata = Metadata(job_description=JD, requirements=requirements())
    result = ats_optimizer(text_document("\n".join(RESUME)), None, metadata, None)
    for name in ("Standard fonts", "No tables", "No images", "Single column", "File name"):
        item = check(result, name)
        assert item["ok"] is False and item["warn"] is True


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("SCORING_API_KEY", raising=False)
    with TestClient(api.app) as instance:
        yield instance


def test_endpoint_scores_a_pdf(client):
    metadata = Metadata(job_description=JD, requirements=requirements())
    response = client.post(
        "/v1/ats-optimizer/pdf",
        data={"metadata": metadata.model_dump_json()},
        files={"resume": ("Asha_Example_Resume.pdf", make_pdf(RESUME), "application/pdf")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["match_score"] == 66.7
    assert response.json()["engine_version"] == "1.1.0"


def test_endpoint_requires_a_required_term(client):
    metadata = Metadata(job_description=JD, requirements=requirements(required=()))
    response = client.post(
        "/v1/ats-optimizer/pdf",
        data={"metadata": metadata.model_dump_json()},
        files={"resume": ("a.pdf", make_pdf(RESUME), "application/pdf")},
    )
    assert response.status_code == 422


def make_two_column_pdf():
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=(600, 800))
    pdf.setFont("Helvetica", 11)
    for index, line in enumerate(RESUME):
        y = 740 - index * 20
        pdf.drawString(40, y, "Sidebar item")
        pdf.drawString(230, y, line)
    pdf.showPage()
    pdf.save()
    return output.getvalue()


def make_ruled_table_pdf():
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=(600, 800))
    pdf.setFont("Helvetica", 11)
    for index, line in enumerate(RESUME):
        pdf.drawString(50, 740 - index * 20, line)
    for row in range(4):
        for col in range(3):
            pdf.rect(50 + col * 120, 400 - row * 30, 120, 30)
            pdf.drawString(55 + col * 120, 410 - row * 30, f"Cell {row}{col}")
    pdf.showPage()
    pdf.save()
    return output.getvalue()


def test_plain_pdf_tables_warn_because_borderless_ones_cant_be_seen():
    item = check(run(RESUME), "No tables")
    assert item["ok"] is False and item["warn"] is True
    assert "borderless" in item["detail"]


def test_ruled_table_fails():
    item = check(run(RESUME, data=make_ruled_table_pdf()), "No tables")
    assert item["ok"] is False
    assert not item["warn"]


def test_two_columns_sharing_a_baseline_fail_single_column():
    item = check(run(RESUME, data=make_two_column_pdf()), "Single column")
    assert item["ok"] is False
    assert not item["warn"]


def test_year_ranges_are_not_a_phone_number():
    lines = [line for line in RESUME if "@" not in line] + [
        "asha@example.com",
        "Example Corp 2019 - 2023",
        "B.Tech 2014 - 2018",
    ]
    assert check(run(lines), "Contact details in the body")["ok"] is False


def test_large_body_text_fails_the_size_check():
    assert check(run(RESUME, size=14), "Body font size 10–12 pt")["ok"] is False


def test_blank_pdf_fails_text_based():
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=(600, 800))
    pdf.showPage()
    pdf.save()
    data = output.getvalue()
    metadata = Metadata(job_description=JD, requirements=requirements())
    result = ats_optimizer(
        extract_pdf(data), layout_facts(data), metadata, "Asha_Example_Resume.pdf"
    )
    assert check(result, "Text-based PDF")["ok"] is False
