import React, { useEffect, useRef, useState } from 'react'
import { apiClient } from '../lib/api-client'

export interface ExecutionConsoleProps {
  sessionId?: string | number
  onClose?: () => void
}

type SessionEvent = {
  id?: string
  type?: string
  data?: any
  timestamp?: string
}

export function ExecutionConsole({ sessionId, onClose }: ExecutionConsoleProps) {
  const [status, setStatus] = useState<string>('unknown')
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [contextPreview, setContextPreview] = useState<string | null>(null)
  const [awaitingInputValue, setAwaitingInputValue] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const bufferRef = useRef<SessionEvent[]>([])
  const flushTimerRef = useRef<number | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const mounted = useRef(true)

  // Helper to push events to buffer and flush in a debounced way (75ms)
  const pushEventBuffered = (ev: SessionEvent) => {
    bufferRef.current.push(ev)
    if (flushTimerRef.current == null) {
      flushTimerRef.current = window.setTimeout(() => {
        if (!mounted.current) return
        setEvents(prev => {
          const merged = prev.concat(bufferRef.current)
          return merged.slice(-500) // cap
        })
        bufferRef.current = []
        flushTimerRef.current = null
      }, 75)
    }
  }

  useEffect(() => {
    mounted.current = true
    setError(null)
    if (!sessionId) {
      setError('No session id provided')
      return
    }

    // Prefer apiClient.subscribeSessionEvents if available
    const anyClient = apiClient as any
    let unsub: (() => void) | null = null
    let localEs: EventSource | null = null
    let simulatedInterval: number | null = null

    const handleIncoming = (raw: any) => {
      const e: SessionEvent = {
        id: raw.id || String(Math.random()).slice(2, 8),
        type: raw.type,
        data: raw.data ?? raw,
        timestamp: raw.timestamp || new Date().toISOString(),
      }

      // Update status immediately for status events
      if (e.type === 'status' || (e.data && e.data.status)) {
        const newStatus = (e.data && e.data.status) || e.type
        setStatus(newStatus)
      }

      // Handle context diff specially
      if (e.type === 'context_diff' || e.data?.diff) {
        try {
          const payload = e.data?.diff ?? e.data
          if (typeof payload === 'string') {
            setContextPreview(payload)
          } else {
            setContextPreview(JSON.stringify(payload, null, 2))
          }
        } catch (err) {
          setContextPreview(String(e.data))
        }
      }

      // push into main list buffered
      pushEventBuffered(e)
    }

    if (typeof anyClient.subscribeSessionEvents === 'function') {
      try {
        unsub = anyClient.subscribeSessionEvents(sessionId, handleIncoming)
      } catch (err: any) {
        setError(String(err?.message || err))
      }
    } else if (typeof EventSource !== 'undefined') {
      // Fallback to EventSource to /api/sessions/${sessionId}/stream
      try {
        const url = `${(apiClient as any).baseUrl ?? ''}/api/sessions/${encodeURIComponent(
          String(sessionId)
        )}/stream`
        localEs = new EventSource(url)
        esRef.current = localEs
        localEs.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data)
            handleIncoming(data)
          } catch (err) {
            handleIncoming({ type: 'log', data: ev.data, timestamp: new Date().toISOString() })
          }
        }
        localEs.onerror = (ev) => {
          setError('Session stream error')
        }
      } catch (err: any) {
        setError(String(err?.message || err))
      }
    } else {
      // No SSE support in environment — simulate events so UI can be demoed
      let counter = 0
      simulatedInterval = window.setInterval(() => {
        counter++
        const types = ['tick', 'log', 'context_diff', 'status']
        const t = types[counter % types.length]
        const sample =
          t === 'context_diff'
            ? { diff: { added: { foo: 'bar' }, removed: [] } }
            : t === 'status'
            ? { status: counter % 4 === 0 ? 'awaiting_input' : 'running' }
            : t === 'log'
            ? `Log line ${counter}`
            : { progress: counter * 10 }
        handleIncoming({ type: t, data: sample, timestamp: new Date().toISOString() })
        if (counter > 20 && simulatedInterval) {
          clearInterval(simulatedInterval)
        }
      }, 300)
    }

    return () => {
      mounted.current = false
      if (unsub) unsub()
      if (localEs) {
        try {
          localEs.close()
        } catch {}
      }
      if (simulatedInterval) {
        clearInterval(simulatedInterval)
      }
      if (flushTimerRef.current != null) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
    }
  }, [sessionId])

  const handleResume = async () => {
    if (!sessionId) {
      setError('No session id')
      return
    }
    setError(null)

    const anyClient = apiClient as any
    if (typeof anyClient.resumeSession === 'function') {
      try {
        await anyClient.resumeSession(sessionId, { input: awaitingInputValue })
        // assume backend will emit events; reflect a queued resume event locally
        pushEventBuffered({
          id: `resume-${Date.now()}`,
          type: 'status',
          data: { status: 'running' },
          timestamp: new Date().toISOString(),
        })
        setAwaitingInputValue('')
      } catch (err: any) {
        setError(err?.message || String(err))
      }
    } else {
      // Simulate success by appending synthetic resume event locally
      pushEventBuffered({
        id: `resume-${Date.now()}`,
        type: 'log',
        data: `Resumed with input: ${awaitingInputValue}`,
        timestamp: new Date().toISOString(),
      })
      pushEventBuffered({
        id: `resume-status-${Date.now()}`,
        type: 'status',
        data: { status: 'running' },
        timestamp: new Date().toISOString(),
      })
      setAwaitingInputValue('')
    }
  }

  const renderEventItem = (ev: SessionEvent, idx: number) => {
    const label = ev.type ?? 'event'
    const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : ''
    let body: string
    if (typeof ev.data === 'string') {
      body = ev.data
    } else {
      try {
        body = JSON.stringify(ev.data, null, 2)
      } catch {
        body = String(ev.data)
      }
    }
    return (
      <li key={ev.id ?? idx} style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>
        <div style={{ fontSize: 12, color: '#444' }}>
          <strong>{label}</strong> <span style={{ marginLeft: 8, color: '#888' }}>{ts}</span>
        </div>
        <pre style={{ margin: '6px 0', whiteSpace: 'pre-wrap', fontSize: 12 }}>{body}</pre>
      </li>
    )
  }

  return (
    <div role="region" aria-label={`Execution console for session ${sessionId ?? 'unknown'}`} style={{ padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>Session {sessionId ?? '—'}</h3>
          <div style={{ marginTop: 6 }}>
            <span
              aria-live="polite"
              style={{
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: 12,
                background: status === 'awaiting_input' ? '#ffe8a3' : status === 'failed' ? '#ffd6d6' : '#e6f7ff',
                color: '#111',
                fontSize: 12,
              }}
            >
              {status}
            </span>
          </div>
        </div>
        <div>
          {onClose && (
            <button aria-label="Close console" onClick={onClose} style={{ marginLeft: 8 }}>
              Close
            </button>
          )}
        </div>
      </header>

      {error && (
        <div role="alert" style={{ color: 'crimson', marginBottom: 8 }}>
          {error}
        </div>
      )}

      <section style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <h4 style={{ marginTop: 0 }}>Events</h4>
          <ol
            aria-live="polite"
            aria-label="Session events"
            style={{
              maxHeight: 300,
              overflow: 'auto',
              padding: 8,
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: 6,
            }}
          >
            {events.map((ev, i) => renderEventItem(ev, i))}
            {events.length === 0 && <li style={{ color: '#666' }}>No events yet</li>}
          </ol>
        </div>

        <div style={{ width: 360 }}>
          <h4 style={{ marginTop: 0 }}>Context / Diff</h4>
          <div
            style={{
              minHeight: 120,
              maxHeight: 300,
              overflow: 'auto',
              padding: 8,
              background: '#0f172a',
              color: '#e6edf3',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            {contextPreview ? <pre style={{ whiteSpace: 'pre-wrap' }}>{contextPreview}</pre> : <div style={{ color: '#9aa4b2' }}>No context diffs yet</div>}
          </div>

          {status === 'awaiting_input' && (
            <div style={{ marginTop: 12 }}>
              <label htmlFor="awaiting-input" style={{ display: 'block', marginBottom: 6 }}>
                Awaiting input
              </label>
              <textarea
                id="awaiting-input"
                aria-label="Provide input to resume session"
                value={awaitingInputValue}
                onChange={(e) => setAwaitingInputValue(e.target.value)}
                rows={4}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleResume} disabled={awaitingInputValue.trim().length === 0} aria-disabled={awaitingInputValue.trim().length === 0}>
                  Resume
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default ExecutionConsole