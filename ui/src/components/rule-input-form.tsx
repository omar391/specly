import React, { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { apiClient } from '@/lib/api-client'

type RulePayload = {
  id?: string
  title: string
  source?: string
  text: string
  metadata?: Record<string, any>
  confidence?: number
  created_at?: string
}

interface Props {
  open: boolean
  onClose(): void
  onSaved?(rule: RulePayload): void
  initialRule?: string | Partial<RulePayload>
}

function collapseWhitespace(s: string) {
  return s.replace(/\s+/g, ' ').trim()
}

function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sortObjectKeys)
  const keys = Object.keys(obj).sort()
  const out: any = {}
  for (const k of keys) {
    out[k] = sortObjectKeys(obj[k])
  }
  return out
}

function normalizeRuleInput(values: { title: string; text: string; metadata?: any; source?: string }) {
  const title = collapseWhitespace(values.title || '')
  const text = collapseWhitespace(values.text || '')
  const source = values.source ? collapseWhitespace(values.source) : undefined
  let metadata = values.metadata
  if (typeof metadata === 'string' && metadata.trim().length > 0) {
    try {
      metadata = JSON.parse(metadata)
    } catch {
      // leave as string for validation to catch
    }
  }
  if (metadata && typeof metadata === 'object') {
    // lower-case keys and sort
    const normalized: any = {}
    Object.keys(metadata)
      .map(k => k.toLowerCase())
      .sort()
      .forEach(k => {
        normalized[k] = sortObjectKeys((metadata as any)[k])
      })
    metadata = normalized
  }
  return { title, text, metadata, source }
}

export function RuleInputForm({ open, onClose, onSaved, initialRule }: Props) {
  const initial = typeof initialRule === 'string' ? { title: '', text: initialRule } : (initialRule || {})
  const [title, setTitle] = useState<string>((initial as any).title || '')
  const [source, setSource] = useState<string | undefined>((initial as any).source)
  const [text, setText] = useState<string>((initial as any).text || '')
  const [metadataText, setMetadataText] = useState<string>(() => {
    const m = (initial as any).metadata
    return m ? JSON.stringify(m, Object.keys(m).sort(), 2) : ''
  })
  const [metadataError, setMetadataError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [existingRules, setExistingRules] = useState<Array<RulePayload>>([])
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [validated, setValidated] = useState<boolean>(false)

  useEffect(() => {
    if (!open) return
    setTitle((initial as any).title || '')
    setSource((initial as any).source)
    setText((initial as any).text || '')
    setMetadataText(() => {
      const m = (initial as any).metadata
      return m ? JSON.stringify(m, Object.keys(m).sort(), 2) : ''
    })
    setMetadataError(null)
    setDuplicateWarning(null)
    setValidated(false)

    // runtime-detect apiClient.getRules
    if (typeof (apiClient as any).getRules === 'function') {
      ;(apiClient as any)
        .getRules({ workspaceId: undefined })
        .then((res: any) => {
          if (res && res.data && Array.isArray(res.data.rules)) {
            setExistingRules(res.data.rules)
          } else if (res && Array.isArray(res)) {
            setExistingRules(res)
          } else {
            setExistingRules([])
          }
        })
        .catch(() => setExistingRules([]))
      return
    }

    // fallback: read mocked rules from localStorage or use empty
    try {
      const raw = localStorage.getItem('ui:mock:rules')
      if (raw) {
        setExistingRules(JSON.parse(raw))
      } else {
        setExistingRules([])
      }
    } catch {
      setExistingRules([])
    }
  }, [open, initial])

  const normalized = useMemo(() => {
    try {
      const md = metadataText && metadataText.trim() ? JSON.parse(metadataText) : undefined
      return normalizeRuleInput({ title, text, metadata: md, source })
    } catch (e) {
      return normalizeRuleInput({ title, text, metadata: metadataText, source })
    }
  }, [title, text, metadataText, source])

  useEffect(() => {
    // validate metadata JSON
    if (metadataText.trim().length === 0) {
      setMetadataError(null)
      return
    }
    try {
      JSON.parse(metadataText)
      setMetadataError(null)
    } catch (e: any) {
      setMetadataError(e.message || 'Invalid JSON')
    }
  }, [metadataText])

  useEffect(() => {
    // duplicate detection by normalized text or title
    const normText = normalized.text
    const normTitle = normalized.title.toLowerCase()
    const dupByTitle = existingRules.find(r => (r.title || '').toLowerCase() === normTitle)
    const dupByText = existingRules.find(r => {
      const rt = collapseWhitespace(r.text || '').toLowerCase()
      return rt === (normText || '').toLowerCase()
    })
    if (dupByTitle) {
      setDuplicateWarning(`A rule with the title "${dupByTitle.title}" already exists.`)
    } else if (dupByText) {
      setDuplicateWarning(`A rule with similar text already exists (id=${dupByText.id}).`)
    } else {
      setDuplicateWarning(null)
    }
  }, [existingRules, normalized])

  const canSave = useMemo(() => {
    return !duplicateWarning && !metadataError && normalized.title.length > 0 && normalized.text.length > 0 && !isSaving
  }, [duplicateWarning, metadataError, normalized, isSaving])

  async function handleValidate() {
    setValidated(true)
    if (metadataError) return
    // basic validation done
  }

  async function handleNormalizePreview() {
    setValidated(true)
  }

  async function handleSave() {
    setValidated(true)
    if (!canSave) return
    setIsSaving(true)
    const payload: RulePayload = {
      title: normalized.title,
      source: normalized.source,
      text: normalized.text,
      metadata: normalized.metadata,
      confidence: 0.5,
      created_at: new Date().toISOString(),
    }

    // runtime call
    if (typeof (apiClient as any).createRule === 'function') {
      try {
        const res = await (apiClient as any).createRule(payload)
        const created = res && res.data ? res.data.rule || res.data : res
        setIsSaving(false)
        onSaved && onSaved(created)
        onClose()
        return
      } catch {
        // fallthrough to simulate
      }
    }

    // simulate network delay and create
    await new Promise(r => setTimeout(r, 300))
    const createdSim = { ...payload, id: `mock-${Date.now()}` }
    // persist to localStorage mocked rules
    try {
      const raw = localStorage.getItem('ui:mock:rules')
      const arr = raw ? JSON.parse(raw) : []
      arr.unshift(createdSim)
      localStorage.setItem('ui:mock:rules', JSON.stringify(arr))
    } catch {}
    setIsSaving(false)
    onSaved && onSaved(createdSim)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent aria-label="Rule editor" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{(initial as any).id ? 'Edit Rule' : 'New Rule'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="rule-title">Title</Label>
            <Input id="rule-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            {validated && title.trim().length === 0 && (
              <p role="alert" aria-live="polite" className="text-sm text-red-600">Title is required</p>
            )}
          </div>

          <div>
            <Label htmlFor="rule-source">Source (optional)</Label>
            <Input id="rule-source" value={source || ''} onChange={(e) => setSource(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="rule-text">Rule text</Label>
            <Textarea id="rule-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} />
            {validated && text.trim().length === 0 && (
              <p role="alert" aria-live="polite" className="text-sm text-red-600">Rule text is required</p>
            )}
          </div>

          <div>
            <Label htmlFor="rule-metadata">Metadata (JSON, optional)</Label>
            <Textarea id="rule-metadata" value={metadataText} onChange={(e) => setMetadataText(e.target.value)} rows={4} />
            {metadataError && (
              <p role="alert" aria-live="polite" className="text-sm text-red-600">Metadata JSON error: {metadataError}</p>
            )}
          </div>

          <div>
            <Label>Normalized preview</Label>
            <pre className="p-2 border rounded bg-gray-50 text-xs max-h-40 overflow-auto">
{JSON.stringify({
  title: normalized.title,
  source: normalized.source,
  text: normalized.text,
  metadata: normalized.metadata
}, null, 2)}
            </pre>
          </div>

          <div aria-live="polite">
            {duplicateWarning ? (
              <p className="text-sm text-yellow-700">{duplicateWarning}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No duplicates detected</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center gap-2 mt-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleValidate} variant="ghost">Validate</Button>
          <Button onClick={handleNormalizePreview} variant="ghost">Normalize</Button>
          <Button onClick={handleSave} disabled={!canSave}>{isSaving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
