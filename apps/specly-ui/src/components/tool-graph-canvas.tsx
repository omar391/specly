import { useMemo } from "react"

export type Node = { id: string; label?: string }
export type Edge = { from: string; to: string; label?: string }

export function detectSelfLoops(edges: Edge[]): string[] {
  return edges.filter((e) => e.from === e.to).map((e) => `Self-loop on '${e.from}'`)
}

/**
 * Detect cycles using Kahn's algorithm.
 * Returns [] when no cycles found, otherwise array with a message.
 */
export function detectCycles(nodes: Node[], edges: Edge[]): string[] {
  const ids = new Set(nodes.map((n) => n.id))
  const adj = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const id of ids) {
    adj.set(id, [])
    indeg.set(id, 0)
  }
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue
    adj.get(e.from)!.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1)
  }

  const q: string[] = []
  for (const id of ids) if ((indeg.get(id) || 0) === 0) q.push(id)

  let visited = 0
  while (q.length) {
    const n = q.shift()!
    visited++
    for (const nb of adj.get(n) || []) {
      indeg.set(nb, (indeg.get(nb) || 0) - 1)
      if ((indeg.get(nb) || 0) === 0) q.push(nb)
    }
  }

  if (visited === ids.size) return []
  return ["Graph contains a cycle"]
}

/**
 * Compute topological layers (array of arrays of node ids) using Kahn's algorithm.
 * Returns { layers, order } or throws Error when cycle detected.
 */
export function computeLayers(nodes: Node[], edges: Edge[]): { layers: string[][]; order: string[] } {
  const ids = Array.from(new Set(nodes.map((n) => n.id)))
  const adj = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const id of ids) {
    adj.set(id, [])
    indeg.set(id, 0)
  }
  for (const e of edges) {
    if (!adj.has(e.from) || !adj.has(e.to)) continue
    adj.get(e.from)!.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1)
  }

  const layers: string[][] = []
  const zero: string[] = []
  for (const id of ids) if ((indeg.get(id) || 0) === 0) zero.push(id)

  let q = zero.slice()
  const visitedOrder: string[] = []

  while (q.length) {
    layers.push(q.slice())
    const next: string[] = []
    for (const n of q) {
      visitedOrder.push(n)
      for (const nb of adj.get(n) || []) {
        indeg.set(nb, (indeg.get(nb) || 0) - 1)
        if ((indeg.get(nb) || 0) === 0) next.push(nb)
      }
    }
    q = next
  }

  if (visitedOrder.length !== ids.length) {
    throw new Error("Cycle detected while computing layers")
  }

  return { layers, order: visitedOrder }
}

interface ToolGraphCanvasProps {
  nodes: Node[]
  edges: Edge[]
  width?: number
  rowHeight?: number
}

/**
 * Minimal read-only DAG renderer.
 * - Lays out nodes into topological layers (rows)
 * - Renders nodes as rectangles and edges as SVG paths with arrows
 */
export default function ToolGraphCanvas({ nodes, edges, width = 600, rowHeight = 100 }: ToolGraphCanvasProps) {
  const memo = useMemo(() => {
    const selfLoops = detectSelfLoops(edges)
    if (selfLoops.length) return { error: selfLoops.join("; ") }

    try {
      const { layers } = computeLayers(nodes, edges)
      return { layers }
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  }, [nodes, edges])

  if ("error" in memo) {
    return <div role="alert" className="text-sm text-red-600">Graph error: {memo.error}</div>
  }

  const layers: string[][] = memo.layers
  const height = Math.max(120, layers.length * rowHeight + 40)
  const nodeWidth = 140
  const nodeHeight = 40

  // map id to position
  const positions = new Map<string, { x: number; y: number }>()
  layers.forEach((layer, layerIdx) => {
    const y = 20 + layerIdx * rowHeight
    const cols = layer.length
    const totalW = Math.max(width, cols * (nodeWidth + 20))
    layer.forEach((id, i) => {
      const x = Math.round((totalW / (cols + 1)) * (i + 1))
      positions.set(id, { x, y })
    })
  })

  // helper to make an SVG path from a -> b (simple cubic)
  function edgePath(from: string, to: string) {
    const a = positions.get(from)
    const b = positions.get(to)
    if (!a || !b) return ""
    const startX = a.x + nodeWidth / 2
    const startY = a.y + nodeHeight
    const endX = b.x - nodeWidth / 2
    const endY = b.y
    const dx = Math.abs(endX - startX)
    const cx1 = startX
    const cy1 = startY + Math.min(40, rowHeight / 2)
    const cx2 = endX
    const cy2 = endY - Math.min(40, rowHeight / 2)
    return `M ${startX} ${startY} C ${cx1} ${cy1} ${cx2} ${cy2} ${endX} ${endY}`
  }

  return (
    <div role="img" aria-label="Tool graph canvas" className="w-full overflow-auto">
      <svg width={Math.max(width, 300)} height={height} role="presentation" aria-hidden="true">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L10,5 L0,10 z" fill="#374151" />
          </marker>
        </defs>

        {/* edges */}
        {edges.map((e, idx) => {
          const d = edgePath(e.from, e.to)
          if (!d) return null
          return <path key={idx} d={d} stroke="#374151" strokeWidth={1.5} fill="none" markerEnd="url(#arrow)" />
        })}

        {/* nodes */}
        {nodes.map((n) => {
          const pos = positions.get(n.id)
          const cx = pos ? pos.x : 0
          const cy = pos ? pos.y : 0
          const x = cx - nodeWidth / 2
          const y = cy
          return (
            <g key={n.id} role="group" aria-label={`Node ${n.id}${n.label ? `: ${n.label}` : ""}`}>
              <rect x={x} y={y} rx={6} ry={6} width={nodeWidth} height={nodeHeight} fill="#f8fafc" stroke="#cbd5e1" />
              <text x={cx} y={y + nodeHeight / 2 + 5} textAnchor="middle" fontSize={12} fill="#0f172a">{n.label || n.id}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}