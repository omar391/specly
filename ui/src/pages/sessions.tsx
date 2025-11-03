import React, { useEffect, useState } from 'react'
import ExecutionConsole from '../components/execution-console'
import { apiClient } from '../lib/api-client'

type SessionEntry = {
  id: string
  workspace?: string
  task?: string
  status?: string
  started_at?: string
  last_updated?: string
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [inspectedSession, setInspectedSession] = useState<string | number | null>(null)

  const fetchSessions = async () => {
    setLoading(true)
    setError(null)
    const anyClient = apiClient as any
    try {
      if (typeof anyClient.getSessions === 'function') {
        const res = await anyClient.getSessions()
        setSessions(res?.data?.sessions ?? [])
      } else if (typeof anyClient.listSessions === 'function') {
        const res = await anyClient.listSessions()
        setSessions(res?.data?.sessions ?? [])
      } else {
        // Demo fallback
        const now = new Date()
        setSessions([
          {
            id: 's-1',
            workspace: 'workspace-alpha',
            task: 'Create report',
            status: 'running',
            started_at: new Date(now.getTime() - 1000 * 60 * 5).toISOString(),
            last_updated: now.toISOString(),
          },
          {
            id: 's-2',
            workspace: 'workspace-beta',
            task: 'Analyze data',
            status: 'awaiting_input',
            started_at: new Date(now.getTime() - 1000 * 60 * 30).toISOString(),
            last_updated: now.toISOString(),
          },
        ])
      }
    } catch (err: any) {
      setError(String(err?.message ?? err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [])

  return (
    <main aria-labelledby="sessions-heading" style={{ padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 id="sessions-heading" style={{ margin: 0 }}>
          Sessions
        </h2>
        <div>
          <button onClick={fetchSessions} aria-label="Refresh sessions" style={{ marginRight: 8 }}>
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" style={{ color: 'crimson', marginTop: 8 }}>
          {error}
        </div>
      )}

      <section aria-live="polite" style={{ marginTop: 12 }}>
        {loading ? (
          <div>Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div>No recent sessions</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Active sessions table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 8 }}>Session</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Workspace</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Task</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Status</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Started</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Last updated</th>
                <th style={{ padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: 8 }}>{s.id}</td>
                  <td style={{ padding: 8 }}>{s.workspace ?? '—'}</td>
                  <td style={{ padding: 8 }}>{s.task ?? '—'}</td>
                  <td style={{ padding: 8 }}>{s.status ?? 'unknown'}</td>
                  <td style={{ padding: 8 }}>{s.started_at ? new Date(s.started_at).toLocaleString() : '—'}</td>
                  <td style={{ padding: 8 }}>{s.last_updated ? new Date(s.last_updated).toLocaleString() : '—'}</td>
                  <td style={{ padding: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          // Prefer route navigation if available; fallback to URL
                          try {
                            // Try using a client-side route helper if present
                            const nav = (window as any).navigateTo
                            if (typeof nav === 'function') {
                              nav(`/sessions/${encodeURIComponent(s.id)}`)
                              return
                            }
                          } catch {}
                          window.location.href = '/sessions.html?session=' + encodeURIComponent(s.id)
                        }}
                        aria-label={`Open session ${s.id}`}
                      >
                        Open
                      </button>

                      <button
                        onClick={() => {
                          setInspectedSession(s.id)
                        }}
                        aria-label={`Inspect session ${s.id}`}
                      >
                        Inspect
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {inspectedSession && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Inspect session ${inspectedSession}`}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div style={{ width: '90%', maxWidth: 1000, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
              <strong>Session {inspectedSession}</strong>
              <div>
                <button
                  onClick={() => {
                    setInspectedSession(null)
                  }}
                  aria-label="Close inspector"
                >
                  Close
                </button>
              </div>
            </div>
            <div style={{ padding: 12 }}>
              <ExecutionConsole sessionId={inspectedSession!} onClose={() => setInspectedSession(null)} />
            </div>
          </div>
        </div>
      )}
    </main>
  )
}