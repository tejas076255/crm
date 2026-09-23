import { NextResponse } from 'next/server'
import { requireRole, requirePlan, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { extractTextFromPdf } from '@/lib/ai/pdf-extract'

export const dynamic = 'force-dynamic'

function cleanTitleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, '')
  const readable = withoutExt
    .replace(/[_-]+/g, ' ')
    .trim()
  if (!readable) return filename
  return readable.charAt(0).toUpperCase() + readable.slice(1)
}

/**
 * POST /api/ai/knowledge/parse-file  (admin+)
 *
 * Accepts multipart/form-data with a file (.pdf, .txt, .md, .csv, .json)
 * and returns { title, content, filename, size }.
 */
export async function POST(request: Request) {
  try {
    await requirePlan('pro_max')
    const { userId } = await requireRole('admin')

    const limit = checkRateLimit(`ai-kb-parse:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const filename = file.name || 'document.txt'
    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    const arrayBuffer = await file.arrayBuffer()

    let extractedText = ''

    if (ext === 'pdf') {
      try {
        extractedText = await extractTextFromPdf(new Uint8Array(arrayBuffer))
      } catch (err) {
        console.error('[knowledge/parse-file] PDF parse error:', err)
        return NextResponse.json(
          { error: 'Failed to extract text from PDF file' },
          { status: 400 },
        )
      }
    } else {
      try {
        const buffer = Buffer.from(arrayBuffer)
        extractedText = buffer.toString('utf-8')
      } catch (err) {
        console.error('[knowledge/parse-file] text decode error:', err)
        return NextResponse.json(
          { error: 'Failed to decode text file' },
          { status: 400 },
        )
      }
    }

    const cleanedText = extractedText
      .replace(/\0/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (!cleanedText) {
      return NextResponse.json(
        { error: 'The uploaded file contains no readable text content' },
        { status: 400 },
      )
    }

    const suggestedTitle = cleanTitleFromFilename(filename)

    return NextResponse.json({
      title: suggestedTitle,
      content: cleanedText,
      filename,
      size: file.size,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
