import React, { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { apiClient } from "@/lib/api-client"
import { detectCycles, detectSelfLoops } from "@/components/tool-graph-canvas"

type PublishResult = { success: boolean; message?: string; hash?: string }

interface ToolVersionPublisherProps {
  initialManifest?: string | object
  onPublish?: (result: PublishResult) => void
}

/**
 * Canonicalize a JS value into a stable JSON string:
 * - Object keys sorted lexicographically
 * - Arrays keep their order
 * - Primitives are preserved
 */
function canonicalize(value: any): string {
  function canonical(v: any): any {
    if (v === null) return null
    if (Array.isArray(v)) return v.map(canonical)
    if (typeof v === "object") {
      const keys = Object.keys(v).sort()
      const out: Record<string, any> = {}
      for (const k of keys) out[k] = canonical(v[k])
      return out
    }
    if (typeof v === "number") {
      if (!isFinite(v)) return null
      return Number(v)
    }
    return v
  }
  return JSON.stringify(canonical(value))
}

async function sha256Hex(message: string): Promise<string> {
  const enc = new TextEncoder()
  const data = enc.encode(message)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

type NodeDef = { id: string; [k: string]: any }
type EdgeDef = { from: string; to: string; [k: string]: any }

export default function ToolVersionPublisher({ initialManifest, onPublish }: ToolVersionPublisherProps) {
  const initialText = useMemo(() => {
    if (initialManifest == null) return ""
    if (typeof initialManifest === "string") return initialManifest
    try { return JSON.stringify(initialManifest, null, 2) } catch { return String(initialManifest) }
  }, [initialManifest])

  const [text, setText] = useState<string>(initialText)
  const [name, setName] = useState<string>("")
  const [canonical, setCanonical] = useState<string>("")
  const [hash, setHash] = useState<string>("")
  const [parseError, setParseError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [valid, setValid] = useState<boolean>(false)
  const [publishing, setPublishing] = useState<boolean>(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => setText(initialText), [initialText])

  useEffect(() => {
    let mounted = true
    async function compute() {
      setParseError(null)
      if (text.trim() === "") { setCanonical(""); setHash(""); setValid(false); return }
      try {
        const parsed = JSON.parse(text)
        const canon = canonicalize(parsed)
        if (!mounted) return
        setCanonical(canon)
        const h = await sha256Hex(canon)
        if (!mounted) return
        setHash(h)
        setParseError(null)
      } catch (err: any) {
        setParseError(err?.message || String(err))
        setCanonical("")
        setHash("")
        setValid(false)
      }
    }
    compute()
    return () => { mounted = false }
  }, [text])

  function validateGraph(): void {
    setValidationErrors([])
    setValid(false)
    setSuccessMsg(null)
    if (text.trim() === "") { setValidationErrors(["Manifest is empty"]); return }
    try {
      const parsed = JSON.parse(text)
      const nodes: NodeDef[] = Array.isArray(parsed.nodes) ? parsed.nodes : []
      const edges: EdgeDef[] = Array.isArray(parsed.edges) ? parsed.edges : []
      const errs = [...detectSelfLoops(edges), ...detectCycles(nodes, edges)]
      if (errs.length) {
        setValidationErrors(errs)
        setValid(false)
      } else {
        setValidationErrors([])
        setValid(true)
      }
    } catch (err: any) {
      setValidationErrors([`JSON parse error: ${err?.message || String(err)}`])
    }
  }

  async function handlePublish() {
    setPublishing(true)
    setSuccessMsg(null)
    try {
      if (!valid) throw new Error("Validation failed")
      // If apiClient has a publish method, call it; otherwise simulate
      const clientAny = apiClient as any
      let result: PublishResult
      if (typeof clientAny.createToolVersion === "function") {
        result = await clientAny.createToolVersion(name || "default", { manifest: canonical })
      } else {
        // simulate network delay
        await new Promise((r) => setTimeout(r, 500))
        result = { success: true, message: "Published (simulated)", hash }
      }
      setSuccessMsg(result.message || "Published")
      if (onPublish) onPublish(result)
    } catch (err: any) {
      setValidationErrors([err?.message || String(err)])
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="sr-only" htmlFor="tool-name">Tool name</label>
      <Input id="tool-name" value={name} onChange={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Tool name (e.g. my-tool)" />

      <label className="sr-only" htmlFor="manifest-textarea">Tool manifest JSON</label>
      <Textarea id="manifest-textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"nodes":[...],"edges":[...]}' rows={10} />

      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="text-xs text-gray-600">Canonical preview</div>
          <div className="font-mono text-sm break-all bg-gray-50 border rounded px-3 py-2 mt-1">{canonical || "—"}</div>
        </div>

        <div className="w-64">
          <div className="text-xs text-gray-600">Hash (SHA-256)</div>
          <div className="font-mono text-sm break-all mt-1">
            {hash ? (<><span className="mr-2">{hash.slice(0,12)}</span><div className="text-xs text-muted-foreground break-all">{hash}</div></>) : <span className="text-gray-400">—</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={validateGraph} size="sm">Validate Graph</Button>
        <Button onClick={handlePublish} size="sm" disabled={!valid || publishing}>{publishing ? "Publishing..." : "Publish"}</Button>
      </div>

      {validationErrors.length > 0 && (
        <div role="alert" className="text-sm text-red-600">
          {validationErrors.map((m, i) => <div key={i}>{m}</div>)}
        </div>
      )}

      {successMsg && <div role="status" className="text-sm text-green-600">{successMsg}</div>}
    </div>
  )
}