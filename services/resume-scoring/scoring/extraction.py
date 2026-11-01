from hashlib import sha256
from io import BytesIO

import pdfplumber

from scoring.models import Box, Document, Page, Word

MAX_PDF_BYTES = 10 * 1024 * 1024
MAX_PAGES = 12


class DocumentError(ValueError):
    pass


def text_document(text: str) -> Document:
    return Document(text=text, sha256=sha256(text.encode()).hexdigest(), input_kind="text")


def extract_pdf(data: bytes) -> Document:
    if not data or len(data) > MAX_PDF_BYTES:
        raise DocumentError("PDF must be between 1 byte and 10 MiB")
    if not data.startswith(b"%PDF-"):
        raise DocumentError("The uploaded file is not a PDF")
    result = Document(text="", sha256=sha256(data).hexdigest(), input_kind="pdf")
    chunks: list[str] = []
    offset = 0
    try:
        with pdfplumber.open(BytesIO(data)) as pdf:
            if pdf.doc.encryption:
                raise DocumentError("Encrypted PDFs must be unlocked before assessment")
            if not pdf.pages or len(pdf.pages) > MAX_PAGES:
                raise DocumentError(f"PDF must have between 1 and {MAX_PAGES} pages")
            for page in pdf.pages:
                if len(page.chars) > 100_000:
                    raise DocumentError("PDF contains too many characters on one page")
                words = page.extract_words(expand_ligatures=True)
                result.pages.append(
                    Page(
                        number=page.page_number,
                        width=page.width,
                        height=page.height,
                        word_count=len(words),
                    )
                )
                if not words:
                    result.complete = False
                    result.warnings.append(
                        f"Page {page.page_number} has no extractable words. "
                        "It may be blank or scanned; review it before scoring."
                    )
                previous = None
                for word in words:
                    separator = ""
                    if chunks:
                        separator = (
                            "\n"
                            if previous is None or abs(word["top"] - previous["top"]) > 3
                            else " "
                        )
                    chunks.append(separator)
                    offset += len(separator)
                    value = word["text"]
                    chunks.append(value)
                    result.words.append(
                        Word(
                            start=offset,
                            end=offset + len(value),
                            text=value,
                            box=Box(
                                page=page.page_number,
                                x0=word["x0"] - page.bbox[0],
                                top=word["top"] - page.bbox[1],
                                x1=word["x1"] - page.bbox[0],
                                bottom=word["bottom"] - page.bbox[1],
                            ),
                        )
                    )
                    offset += len(value)
                    if offset > 100_000:
                        raise DocumentError("Extracted PDF text exceeds 100,000 characters")
                    previous = word
    except DocumentError:
        raise
    except Exception as exc:
        # Parser errors can contain document contents; never send them to the caller or logs.
        raise DocumentError(
            "PDF could not be read; check for encryption or file corruption"
        ) from exc
    result.text = "".join(chunks)
    if len(result.text.strip()) < 40:
        result.complete = False
        result.warnings.append("Too little extractable text to assess a resume reliably.")
    return result
