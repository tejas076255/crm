import { describe, it, expect } from 'vitest'
import { extractTextFromPdf } from './pdf-extract'

// Properly constructed minimal PDF with valid xref offsets
const validMinimalPdf = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
  '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
  '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n' +
  '4 0 obj\n<< /Length 43 >>\nstream\nBT /F1 12 Tf 72 712 Td (Knowledge Base Test Content) Tj ET\nendstream\nendobj\n' +
  '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n' +
  'xref\n' +
  '0 6\n' +
  '0000000000 65535 f \n' +
  '0000000010 00000 n \n' +
  '0000000060 00000 n \n' +
  '0000000117 00000 n \n' +
  '0000000246 00000 n \n' +
  '0000000340 00000 n \n' +
  'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n404\n%%EOF'
)

describe('extractTextFromPdf', () => {
  it('extracts text from valid PDF buffer', async () => {
    const text = await extractTextFromPdf(new Uint8Array(validMinimalPdf))
    expect(text).toContain('Knowledge Base Test Content')
  })
})
