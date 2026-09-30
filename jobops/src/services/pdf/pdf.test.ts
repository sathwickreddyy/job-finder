import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractPdfText, validatePdf } from './index';
import { MAX_UPLOAD_BYTES } from '@/services/storage';

describe('PDF resumes', () => {
  it('validates content signature, extension, type and bounded size', () => {
    const bytes = Buffer.from('%PDF-1.7\n');
    expect(() => validatePdf(bytes, 'resume.pdf', 'application/pdf')).not.toThrow();
    expect(() => validatePdf(bytes, 'resume.html', 'application/pdf')).toThrow('Only PDF');
    expect(() => validatePdf(Buffer.from('<script>'), 'resume.pdf', 'application/pdf')).toThrow('signature');
    expect(() => validatePdf(bytes, 'resume.pdf', 'text/html')).toThrow('PDF');
    expect(() => validatePdf(Buffer.alloc(MAX_UPLOAD_BYTES + 1), 'resume.pdf', 'application/pdf')).toThrow('10 MB');
  });

  it('extracts selectable text from a real locally generated PDF', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage().drawText('Fictional engineer: Python, Kafka and PostgreSQL', { font });
    const bytes = await doc.save();
    validatePdf(bytes, 'fictional.pdf', 'application/pdf');
    expect(await extractPdfText(bytes)).toContain('Python, Kafka and PostgreSQL');
  });
});
