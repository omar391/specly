import React, { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type OnChangeFn = (specObject: any, hash: string) => void

interface SpecEditorProps {
  initialSpec?: string | object
  onChange?: OnChangeFn
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
    if (Array.isArray(v)) {
      return v.map(canonical)
    }
    if (typeof v === "object") {
      const keys = Object.keys(v).sort()
      const out: Record<string, any> = {}
      for (const k of keys) {
        out[k] = canonical(v[k])
      }
      return out
    }
    // primitives (string, number, boolean)
    // Ensure numbers are proper JS numbers (no NaN/Infinity)
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

export default function SpecEditor({ initialSpec, onChange }: SpecEditorProps) {
  const initialText = useMemo(() => {
    if (initialSpec == null) return ""
    if (typeof initialSpec === "string") return initialSpec
    try {
      return JSON.stringify(initialSpec, null, 2)
    } catch {
      return String(initialSpec)
    }
  }, [initialSpec])

  const [text, setText] = useState<string>(initialText)
  const [parseError, setParseError] = useState<string | null>(null)
  const [canonical, setCanonical] = useState<string>("")
  const [hash, setHash] = useState<string>("")
  const [copied, setCopied] = useState<boolean>(false)

  useEffect(() => {
    setText(initialText)
  }, [initialText])

  useEffect(() => {
    let mounted = true
    async function compute() {
      setParseError(null)
      if (text.trim() === "") {
        setCanonical("")
        setHash("")
        if (onChange) onChange(null, "")
        return
      }
      try {
        const parsed = JSON.parse(text)
        const canon = canonicalize(parsed)
        if (!mounted) return
        setCanonical(canon)
        const h = await sha256Hex(canon)
        if (!mounted) return
        setHash(h)
        setParseError(null)
        if (onChange) onChange(parsed, h)
      } catch (err: any) {
        // JSON.parse error
        const msg = err?.message || String(err)
        // Try extract position if available
        let posMatch: RegExpMatchArray | null = msg.match(/at position (\d+)/i)
        let pretty = msg
        if (!posMatch) {
          // some environments: "Unexpected token x in JSON at position N"
          const m = msg.match(/position (\d+)/i)
          if (m) posMatch = m as RegExpMatchArray
        }
        if (posMatch && /\d+/.test(posMatch[1])) {
          const idx = parseInt(posMatch[1], 10)
          // compute line/col
          const upTo = text.slice(0, idx)
          const lines = upTo.split(/\r\n|\n/)
          const line = lines.length
          const col = lines[lines.length - 1].length + 1
          pretty = `${msg} (line ${line}, col ${col})`
        }
        setParseError(pretty)
        setCanonical("")
        setHash("")
        if (onChange) onChange(null, "")
      }
    }

    compute()

    return () => {
      mounted = false
    }
  }, [text, onChange])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  async function handleCopy() {
    if (!hash) return
    try {
      await navigator.clipboard.writeText(hash)
      setCopied(true)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-3">
      <label className="sr-only" htmlFor="spec-editor-textarea">
        Spec JSON
      </label>
      <Textarea
        id="spec-editor-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Paste spec JSON here — e.g. {"intent":"...","steps":[...]}'
        aria-invalid={parseError ? "true" : "false"}
        rows={12}
      />

      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="text-xs text-gray-600">Canonical preview</div>
          <div className="font-mono text-sm break-all bg-gray-50 border rounded px-3 py-2 mt-1">
            {canonical || "—"}
          </div>
        </div>

        <div className="w-64">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-600">Hash (SHA-256)</div>
              <div className="font-mono text-sm break-all mt-1">
                {hash ? (
                  <>
                    <span className="mr-2">{hash.slice(0, 12)}</span>
                    <div className="text-xs text-muted-foreground break-all">{hash}</div>
                  </>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </div>
            </div>
            <div className="ml-3">
              <Button onClick={handleCopy} size="sm" disabled={!hash}>
                {copied ? "Copied" : "Copy hash"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {parseError && (
        <div role="alert" className="text-sm text-red-600">
          JSON parse error: {parseError}
        </div>
      )}
    </div>
  )
}