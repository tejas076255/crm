'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  BookOpen,
  Upload,
  FileText,
  UploadCloud,
  FileUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';

interface DocSummary {
  id: string;
  title: string;
  updated_at: string;
}

/** Editor target: 'new' when creating, a doc id when editing, null when closed. */
type EditTarget = 'new' | string | null;

function cleanTitleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, '');
  const readable = withoutExt.replace(/[_-]+/g, ' ').trim();
  if (!readable) return filename;
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

export function AiKnowledgeCard({
  accountId,
  canEdit,
  hasEmbeddingsKey,
}: {
  accountId: string | null;
  canEdit: boolean;
  hasEmbeddingsKey: boolean;
}) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorFileInputRef = useRef<HTMLInputElement>(null);
  const loadedAccountIdRef = useRef<string | null>(null);
  const t = useTranslations('Settings.aiKnowledge');

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/knowledge');
      const data = await res.json();
      if (res.ok) setDocs(data.documents ?? []);
      else toast.error(data.error ?? t('loadFailed'));
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchDocs();
  }, [accountId, fetchDocs]);

  const openNew = () => {
    setEditing('new');
    setTitle('');
    setContent('');
  };

  const openEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t('openFailed'));
        return;
      }
      setEditing(id);
      setTitle(data.title ?? '');
      setContent(data.content ?? '');
    } catch {
      toast.error(t('openFailed'));
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setTitle('');
    setContent('');
  };

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error(t('titleContentRequired'));
      return;
    }
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const res = await fetch(
        isNew ? '/api/ai/knowledge' : `/api/ai/knowledge/${editing}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), content: content.trim() }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        if (data.warning) toast.warning(data.warning);
        else toast.success(isNew ? t('saveSuccessNew') : t('saveSuccessUpdate'));
        cancelEdit();
        await fetchDocs();
      } else {
        toast.error(data.error ?? t('saveFailed'));
      }
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('removeSuccess'));
        setDocs((d) => d.filter((x) => x.id !== id));
      } else {
        const data = await res.json();
        toast.error(data.error ?? t('removeFailed'));
      }
    } catch {
      toast.error(t('removeFailed'));
    }
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch('/api/ai/knowledge/reindex', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t('reindexSuccess', { count: data.reindexed }));
      } else {
        toast.error(data.error ?? t('reindexFailed'));
      }
    } catch {
      toast.error(t('reindexFailed'));
    } finally {
      setReindexing(false);
    }
  };

  /** Direct batch upload of files */
  const handleBatchUpload = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const toastId = toast.loading(`Uploading & extracting ${files.length} file(s)...`);

    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('files', f));

      const res = await fetch('/api/ai/knowledge/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Successfully uploaded and indexed ${data.count} document(s)`, {
          id: toastId,
        });
        await fetchDocs();
      } else {
        toast.error(data.error ?? 'Upload failed', { id: toastId });
      }
    } catch {
      toast.error('Failed to upload files', { id: toastId });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /** Parse single file and fill into editor */
  const handleEditorFileImport = async (file: File) => {
    if (!file) return;
    setParsingFile(true);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const defaultTitle = cleanTitleFromFilename(file.name);

    // Client-side instant reading for text files
    if (['txt', 'text', 'md', 'markdown', 'csv', 'json'].includes(ext)) {
      try {
        const text = await file.text();
        if (!text.trim()) {
          toast.error('The selected file is empty.');
          setParsingFile(false);
          return;
        }
        if (!title.trim()) setTitle(defaultTitle);
        setContent(text.trim());
        toast.success(`Imported text from ${file.name}`);
        setParsingFile(false);
        if (editorFileInputRef.current) editorFileInputRef.current.value = '';
        return;
      } catch {
        // Fall back to server parse
      }
    }

    // PDF and other files via server route
    const toastId = toast.loading(`Parsing ${file.name}...`);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/ai/knowledge/parse-file', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.content) {
        if (!title.trim()) setTitle(data.title ?? defaultTitle);
        setContent(data.content ?? '');
        toast.success(`Extracted content from ${file.name}`, { id: toastId });
      } else {
        toast.error(data.error ?? 'Could not extract text from file', { id: toastId });
      }
    } catch {
      toast.error('File parsing failed', { id: toastId });
    } finally {
      setParsingFile(false);
      if (editorFileInputRef.current) editorFileInputRef.current.value = '';
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canEdit || uploading) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!canEdit || uploading) return;
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      if (editing !== null) {
        // If in editor, import first dropped file
        await handleEditorFileImport(droppedFiles[0]);
      } else {
        // If on list/dashboard, batch upload all dropped files
        await handleBatchUpload(droppedFiles);
      }
    }
  };

  return (
    <Card
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`transition-colors ${isDragging ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : ''}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.text,.csv,.json"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleBatchUpload(e.target.files);
          }
        }}
      />
      <input
        ref={editorFileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.text,.csv,.json"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            void handleEditorFileImport(e.target.files[0]);
          }
        }}
      />

      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-primary" /> {t('title')}
          </CardTitle>
          <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
            PDF, TXT, MD, CSV, JSON
          </span>
        </div>
        <CardDescription>
          {t('description', {
            searchType: hasEmbeddingsKey ? t('semanticSearchOn') : t('keywordSearchOn'),
          })}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center py-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('loading')}
          </div>
        ) : (
          <>
            {isDragging && (
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-primary rounded-lg bg-primary/5 text-primary text-sm font-medium">
                <UploadCloud className="h-8 w-8 mb-2 animate-bounce" />
                Drop PDF, TXT or Markdown files here to upload
              </div>
            )}

            {!isDragging && docs.length === 0 && editing === null && (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
                <p className="text-sm font-medium text-foreground">{t('noDocs')}</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Add FAQs, pricing sheets, or policies by uploading files or writing directly.
                </p>
                {canEdit && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4 text-primary" />
                      )}
                      Upload PDF / Text File
                    </Button>
                    <Button size="sm" onClick={openNew}>
                      <Plus className="mr-2 h-4 w-4" /> {t('addDoc')}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!isDragging && docs.length > 0 && editing === null && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {docs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="min-w-0 truncate text-sm text-foreground font-medium">
                        {doc.title}
                      </span>
                    </div>
                    {canEdit && (
                      <span className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => void openEdit(doc.id)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => void remove(doc.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {editing !== null ? (
              <div className="space-y-4 rounded-xl border border-border p-4 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {editing === 'new' ? 'New Knowledge Document' : 'Edit Document'}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => editorFileInputRef.current?.click()}
                    disabled={saving || parsingFile}
                    className="h-8 text-xs border-primary/40 text-primary hover:bg-primary/10"
                  >
                    {parsingFile ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileUp className="mr-1.5 h-3.5 w-3.5 text-primary" />
                    )}
                    Import from PDF / TXT
                  </Button>
                </div>

                {/* Drag / Click banner inside editor */}
                <div
                  onClick={() => editorFileInputRef.current?.click()}
                  className="cursor-pointer flex items-center justify-center gap-2 p-3 border-2 border-dashed border-border rounded-lg bg-card hover:bg-muted/40 hover:border-primary/50 transition-colors text-xs text-muted-foreground text-center"
                >
                  <Upload className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    Click or drag a <strong>PDF, TXT, MD, CSV, JSON</strong> file here to auto-fill
                  </span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kb-title">{t('editDocTitle')}</Label>
                  <Input
                    id="kb-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('editDocTitlePlaceholder')}
                    disabled={saving || parsingFile}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kb-content">{t('editDocContent')}</Label>
                  <Textarea
                    id="kb-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={t('editDocContentPlaceholder')}
                    rows={8}
                    disabled={saving || parsingFile}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    onClick={cancelEdit}
                    disabled={saving || parsingFile}
                  >
                    {t('cancel')}
                  </Button>
                  <Button onClick={save} disabled={saving || parsingFile}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('saveDoc')}
                  </Button>
                </div>
              </div>
            ) : (
              canEdit &&
              docs.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4 text-primary" />
                      )}
                      Upload PDF / Text
                    </Button>
                    <Button variant="outline" size="sm" onClick={openNew}>
                      <Plus className="mr-2 h-4 w-4" /> {t('addDoc')}
                    </Button>
                  </div>

                  {hasEmbeddingsKey && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={reindex}
                      disabled={reindexing}
                      title={t('reindexTooltip')}
                    >
                      {reindexing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      {t('reindex')}
                    </Button>
                  )}
                </div>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
