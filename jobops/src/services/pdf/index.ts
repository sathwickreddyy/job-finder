import { MAX_UPLOAD_BYTES } from "@/services/storage";

export class PdfValidationError extends Error {}

export function validatePdf(buffer: Uint8Array, filename: string, mimeType: string) {
  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES)
    throw new PdfValidationError("Upload a nonempty PDF no larger than 10 MB.");
  if (!/\.pdf$/i.test(filename)) throw new PdfValidationError("Only PDF resumes are supported.");
  if (mimeType && !["application/pdf", "application/octet-stream"].includes(mimeType))
    throw new PdfValidationError("The upload must be a PDF document.");
  if (Buffer.from(buffer.subarray(0, 5)).toString("ascii") !== "%PDF-")
    throw new PdfValidationError("The uploaded file does not have a valid PDF signature.");
}

export async function extractPdfText(buffer: Uint8Array): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text.replace(/\u0000/g, "").trim();
  } finally {
    await parser.destroy();
  }
}
