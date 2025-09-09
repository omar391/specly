import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'

interface ToolVersionItem {
  hash: string
  entry_spec?: string
}

export function ToolsPage() {
  const [tools, setTools] = useState<string[]>([])
  const [selectedTool, setSelectedTool] = useState<string>('')
  const [versions, setVersions] = useState<ToolVersionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)
      const res = await apiClient.getTools()
      if (!alive) return
      if (res.error) setError(res.error)
      setTools(res.data?.tools || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    if (!selectedTool) { setVersions([]); return }
    ;(async () => {
      setLoading(true)
      setError(null)
      const res = await apiClient.getToolVersions(selectedTool)
      if (!alive) return
      if (res.error) setError(res.error)
      setVersions(res.data?.versions || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [selectedTool])

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tools</h1>
        <select
          value={selectedTool}
          onChange={(e) => setSelectedTool(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">Select a tool…</option>
          {tools.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-600">Loading…</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : selectedTool ? (
        <div className="space-y-3">
          {versions.map((v) => (
            <div key={v.hash} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="font-mono text-sm break-all">{v.hash}</div>
              <div className="text-xs text-gray-600 mt-1">Entry: {v.entry_spec || '—'}</div>
            </div>
          ))}
          {versions.length === 0 && (
            <div className="text-gray-500">No versions for {selectedTool}.</div>
          )}
        </div>
      ) : (
        <div className="text-gray-500">Select a tool to view versions.</div>
      )}
    </div>
  )
}

export default ToolsPage
