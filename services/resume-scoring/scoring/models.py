from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

Text = Annotated[str, StringConstraints(min_length=1, max_length=100_000)]
Term = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Importance = Literal["required", "preferred", "unspecified"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Requirement(Model):
    term: Term
    aliases: list[Term] = Field(default_factory=list, max_length=10)
    importance: Importance = "unspecified"
    # Exact quotation anchors manual terms to the supplied JD. It is never a prompt.
    jd_quote: Annotated[str, StringConstraints(min_length=1, max_length=2000)]


class Metadata(Model):
    job_description: Text
    requirements: list[Requirement] | None = Field(default=None, min_length=1, max_length=100)
    resume_version_id: str | None = Field(default=None, max_length=100)
    job_snapshot_id: str | None = Field(default=None, max_length=100)
    application_id: str | None = Field(default=None, max_length=100)

    @field_validator("job_description")
    @classmethod
    def nonblank_jd(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Job description must contain text")
        return value  # Preserve original coordinates and source hash, including whitespace.

    @model_validator(mode="after")
    def verify_quotes(self):
        seen = set()
        for requirement in self.requirements or []:
            if requirement.jd_quote not in self.job_description:
                raise ValueError("Each jd_quote must occur verbatim in job_description")
            key = requirement.term.casefold()
            if key in seen:
                raise ValueError("Requirement terms must be unique")
            seen.add(key)
        return self


class TextRequest(Metadata):
    resume_text: Text

    @field_validator("resume_text")
    @classmethod
    def nonblank_resume(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Resume must contain text")
        return value


class Span(Model):
    start: int
    end: int
    text: str


class Box(Model):
    page: int  # 1-based
    x0: float
    top: float
    x1: float
    bottom: float


class Word(Span):
    box: Box


class Page(Model):
    number: int
    width: float
    height: float
    word_count: int


class Document(Model):
    text: str
    sha256: str
    input_kind: Literal["text", "pdf"]
    words: list[Word] = Field(default_factory=list)
    pages: list[Page] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    complete: bool = True


class Evidence(Span):
    boxes: list[Box] = Field(default_factory=list)


class Finding(Model):
    term: str
    aliases: list[str]
    importance: Importance
    status: Literal["mentioned", "not_evidenced", "unclear"]
    jd_evidence: Span
    resume_evidence: list[Evidence]
    explanation: str
    suggestion: str | None


class Score(Model):
    id: str
    label: str
    value: float | None
    matched: int
    total: int
    method: str


class Assessment(Model):
    schema_version: Literal["1.0"] = "1.0"
    assessment_id: str
    engine: Literal["jobops-lexical"] = "jobops-lexical"
    engine_version: str
    requirement_source: Literal["caller_reviewed", "catalog_suggestions"]
    status: Literal["completed", "needs_review", "unable_to_assess"]
    resume_version_id: str | None
    job_snapshot_id: str | None
    application_id: str | None
    resume_sha256: str
    jd_sha256: str
    input_kind: Literal["text", "pdf"]
    scores: list[Score]
    findings: list[Finding]
    resume_text: str
    pages: list[Page]
    warnings: list[str]
    limitations: list[str]
