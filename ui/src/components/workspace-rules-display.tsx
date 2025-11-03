import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { apiClient } from '@/lib/api-client'
import { RuleInputForm } from './rule-input-form'
import { AlertCircle, Scroll, Clock, Edit2, Trash2, PlusCircle } from 'lucide-react'

interface WorkspaceRule {
  id: string
  title?: string
  category?: string
  type?: string
  text: string
  confidence: number
  created_at: string
  source?: string
  metadata?: Record<string, any>
}

interface Props {
  workspaceId?: string
  showCount?: number
  onRulesChanged?: (rules: WorkspaceRule[]) => void
}

export function WorkspaceRulesDisplay({ workspaceId, showCount = 10, onRulesChanged }: Props) {
  const [rules, setRules] = useState<WorkspaceRule[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [filter, setFilter] = useState<string>('')
  const [onlyHigh, setOnlyHigh] = useState<boolean>(false)
  const [editingRule, setEditingRule] = useState<WorkspaceRule | null>(null)
  const [showEditor, setShowEditor] = useState<boolean>(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      // runtime-detect apiClient.getRules
      if (typeof (apiClient as any).getRules === 'function') {
        try {
          const res = await (apiClient as any).getRules({ workspaceId })
          const payload = res && res.data ? (res.data.rules || res.data || []) : []
          setRules(Array.isArray(payload) ? payload : [])
          setLoading(false)
          return
        } catch {
          // fallback
        }
      }
      // fallback to localStorage mocked rules
      try {
        const raw = localStorage.getItem('ui:mock:rules')
        const arr = raw ? JSON.parse(raw) : []
        setRules(arr)
      } catch {
        setRules([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [workspaceId])

  useEffect(() => {
    onRulesChanged && onRulesChanged(rules)
  }, [rules, onRulesChanged])

  const filtered = useMemo(() => {
    let out = rules.slice()
    if (filter.trim()) {
      const q = filter.toLowerCase()
      out = out.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.text || '').toLowerCase().includes(q)
      )
    }
    if (onlyHigh) {
      out = out.filter(r => (r.confidence || 0) >= 0.75)
    }
    return out.slice(0, showCount)
  }, [rules, filter, onlyHigh, showCount])

  const persistLocal = (next: WorkspaceRule[]) => {
    setRules(next)
    try {
      localStorage.setItem('ui:mock:rules', JSON.stringify(next))
    } catch {}
    onRulesChanged && onRulesChanged(next)
  }

  const handleReinforce = async (ruleId: string) => {
    // runtime call
    if (typeof (apiClient as any).reinforceRule === 'function') {
      try {
        await (apiClient as any).reinforceRule(ruleId)
        // reload list if API provides it
        const res = await (apiClient as any).getRules({ workspaceId })
        const payload = res && res.data ? (res.data.rules || res.data || []) : []
        setRules(Array.isArray(payload) ? payload : rules)
        return
      } catch {
        // fallback to simulated
      }
    }
    // simulate: bump confidence locally
    const next = rules.map(r => r.id === ruleId ? { ...r, confidence: Math.min(1, (r.confidence || 0) + 0.1) } : r)
    persistLocal(next)
  }

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Delete this rule?')) return
    if (typeof (apiClient as any).deleteRule === 'function') {
      try {
        await (apiClient as any).deleteRule(ruleId)
        const res = await (apiClient as any).getRules({ workspaceId })
        const payload = res && res.data ? (res.data.rules || res.data || []) : []
        setRules(Array.isArray(payload) ? payload : rules.filter(r => r.id !== ruleId))
        return
      } catch {
        // fallback
      }
    }
    const next = rules.filter(r => r.id !== ruleId)
    persistLocal(next)
  }

  const handleSaved = (saved: WorkspaceRule) => {
    // runtime update unknown in API; just update local list
    const exists = rules.find(r => r.id && saved.id && r.id === saved.id)
    let next: WorkspaceRule[]
    if (exists) {
      next = rules.map(r => (r.id === saved.id ? { ...r, ...saved } : r))
    } else {
      next = [ { ...saved, id: saved.id || `mock-${Date.now()}` }, ...rules ]
    }
    persistLocal(next)
    setShowEditor(false)
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scroll size={18} />
          <CardTitle>Workspace Rules</CardTitle>
          <Badge variant="outline">{rules.length} rule{rules.length !== 1 ? 's' : ''}</Badge>
        </div>

        <div className="flex items-center gap-2">
          <Input placeholder="Filter by title or text..." value={filter} onChange={(e:any)=>setFilter(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyHigh} onChange={(e)=>setOnlyHigh(e.target.checked)} />
            High confidence
          </label>
          <Button onClick={() => { setEditingRule(null); setShowEditor(true) }}><PlusCircle size={16} className="mr-2" />New Rule</Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading rules…</div>
        ) : rules.length === 0 ? (
          <div className="text-center py-6">
            <AlertCircle size={36} className="mx-auto text-muted-foreground" />
            <p className="text-muted-foreground mt-2">No workspace rules yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(rule => (
              <div key={rule.id} className="flex items-start gap-3 p-3 border rounded-lg">
                <Badge variant="secondary" className="text-xs">{rule.type || 'rule'}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{rule.title || rule.text.slice(0,60)}</p>
                      <p className="text-sm text-muted-foreground truncate">{rule.text}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>Confidence: {Math.round((rule.confidence || 0) * 100)}%</span>
                        <span>{new Date(rule.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setEditingRule(rule); setShowEditor(true) }}><Edit2 size={14} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReinforce(rule.id)}><PlusCircle size={14} /></Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(rule.id)}><Trash2 size={14} /></Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {showEditor && (
        <RuleInputForm
          open={showEditor}
          onClose={() => setShowEditor(false)}
          initialRule={editingRule || undefined}
          onSaved={(r:any) => handleSaved(r)}
        />
      )}
    </Card>
  )
}
