import { extractText } from 'unpdf'

/**
 * Fallback text extractor that extracts text tokens directly from PDF binary
 */
function fallbackPdfTextExtract(uint8Array: Uint8Array): string {
  try {
    const raw = Buffer.from(uint8Array).toString('latin1')
    const textMatches: string[] = []

    // 1. Matches (some text) Tj or (some text) TJ
    const tjRegex = /\(((?:\\\(|\\\)|[^()])*)\)\s*T[jJ]/gi
    let match: RegExpExecArray | null
    while ((match = tjRegex.exec(raw)) !== null) {
      const decoded = match[1]
        .replace(/\\([()\\])/g, '$1')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
      if (decoded.trim()) {
        textMatches.push(decoded.trim())
      }
    }

    // 2. Matches [(string1) 10 (string2)] TJ
    const arrayTjRegex = /\[([\s\S]*?)\]\s*TJ/gi
    let arrMatch: RegExpExecArray | null
    while ((arrMatch = arrayTjRegex.exec(raw)) !== null) {
      const inner = arrMatch[1]
      const innerStrRegex = /\(((?:\\\(|\\\)|[^()])*)\)/g
      let sMatch: RegExpExecArray | null
      while ((sMatch = innerStrRegex.exec(inner)) !== null) {
        const decoded = sMatch[1]
          .replace(/\\([()\\])/g, '$1')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
        if (decoded.trim()) {
          textMatches.push(decoded.trim())
        }
      }
    }

    // 3. General literal string extraction inside streams if nothing found
    if (textMatches.length === 0) {
      const literalRegex = /\(([A-Za-z0-9\s.,!?:;'"_@#%&*+=-]{3,})\)/g
      let litMatch: RegExpExecArray | null
      while ((litMatch = literalRegex.exec(raw)) !== null) {
        const str = litMatch[1].trim()
        if (str && !str.startsWith('/') && str.length > 2) {
          textMatches.push(str)
        }
      }
    }

    return textMatches.join(' ').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

/**
 * Extract text from a PDF Uint8Array.
 * Uses unpdf as primary parser with multi-stage fallback.
 */
export async function extractTextFromPdf(uint8Array: Uint8Array): Promise<string> {
  try {
    const res = await extractText(uint8Array)
    const rawText = (res as { text?: unknown })?.text
    let extracted = ''
    if (Array.isArray(rawText)) {
      extracted = rawText.join('\n\n').trim()
    } else if (typeof rawText === 'string') {
      extracted = rawText.trim()
    }

    if (extracted) {
      return extracted
    }
  } catch (err) {
    console.warn('[pdf-extract] unpdf parser warning, using fallback stream extraction:', err)
  }

  // Fallback extraction
  const fallback = fallbackPdfTextExtract(uint8Array)
  if (fallback && fallback.trim()) {
    return fallback.trim()
  }

  throw new Error('Could not extract readable text from PDF. Ensure the PDF has text content (not a scanned image).')
}
