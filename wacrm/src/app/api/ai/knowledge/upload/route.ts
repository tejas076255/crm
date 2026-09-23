import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  requirePlan,
  toErrorResponse,
} from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadEmbeddingsKey } from '@/lib/ai/config'
import { ingestDocument } from '@/lib/ai/knowledge'
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

async function extractTextFromFile(file: File): Promise<string> {
  const filename = file.name || 'document.txt'
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const arrayBuffer = await file.arrayBuffer()

  if (ext === 'pdf') {
    const raw = await extractTextFromPdf(new Uint8Array(arrayBuffer))
    return (raw || '').replace(/\0/g, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  const buffer = Buffer.from(arrayBuffer)
  return buffer.toString('utf-8').replace(/\0/g, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * POST /api/ai/knowledge/upload  (admin+)
 *
 * Uploads one or multiple files (.pdf, .txt, .md, .csv, .json),
 * parses them, creates knowledge base documents, and indexes them.
 */
export async function POST(request: Request) {
  try {
    await requirePlan('pro_max')
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`ai-kb-upload:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const formData = await request.formData()
    const rawFiles = formData.getAll('files') as File[]
    const singleFile = formData.get('file') as File | null
    const files: File[] = rawFiles.length > 0 ? rawFiles : singleFile ? [singleFile] : []

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 })
    }

    const { key: embeddingsApiKey } = await loadEmbeddingsKey(supabase, accountId)

    const results: Array<{ id: string; title: string; filename: string; success: boolean; error?: string }> = []

    for (const file of files) {
      const filename = file.name || 'document.txt'
      const title = cleanTitleFromFilename(filename)

      try {
        const content = await extractTextFromFile(file)
        if (!content) {
          results.push({ id: '', title, filename, success: false, error: 'Empty file' })
          continue
        }

        const { data: doc, error: insErr } = await supabase
          .from('ai_knowledge_documents')
          .insert({ account_id: accountId, created_by: userId, title, content })
          .select('id')
          .single()

        if (insErr || !doc) {
          results.push({ id: '', title, filename, success: false, error: insErr?.message || 'Insert failed' })
          continue
        }

        try {
          await ingestDocument(supabase, accountId, { embeddingsApiKey }, doc.id, content)
        } catch (ingestErr) {
          console.error('[knowledge/upload] Ingest error for', doc.id, ingestErr)
        }

        results.push({ id: doc.id, title, filename, success: true })
      } catch (err: unknown) {
        console.error('[knowledge/upload] Parse/upload error for', filename, err)
        const msg = err instanceof Error ? err.message : 'Processing failed'
        results.push({ id: '', title, filename, success: false, error: msg })
      }
    }

    const successful = results.filter((r) => r.success)
    if (successful.length === 0 && results.length > 0) {
      return NextResponse.json(
        { error: results[0]?.error || 'Failed to upload files', results },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      count: successful.length,
      documents: successful,
      results,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
