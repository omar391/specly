import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'

interface SpecItem {
  hash: string
  intent?: string
  executor_type?: string
}

export function SpecsPage() {
  const [items, setItems] = useState<SpecItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)
      const res = await apiClient.getSpecs()
      if (!alive) return
      if (res.error) setError(res.error)
      setItems(res.data?.specs || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const filtered = items.filter((s) => s.hash.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Specs</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by hash prefix"
          className="border rounded px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <div className="text-gray-600">Loading...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((s) => (
            <div key={s.hash} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="font-mono text-sm break-all">{s.hash}</div>
              <div className="text-xs text-gray-600 mt-1">
                {s.intent || '—'} {s.executor_type ? `• ${s.executor_type}` : ''}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-gray-500">No specs found.</div>
          )}
        </div>
      )}
    </div>
  )
}

export default SpecsPage
