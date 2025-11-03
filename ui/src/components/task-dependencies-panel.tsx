import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { apiClient, type Task } from '@/lib/api-client'
import { cn } from '@/lib/utils'

interface Props {
  taskId: string | number
  open: boolean
  onClose(): void
  onUpdated?(updatedTask: any): void
}

function buildAdjacency(tasks: Task[]) {
  const map = new Map<string, string[]>()
  tasks.forEach(t => map.set(t.id, Array.isArray(t.dependencies) ? t.dependencies.slice() : []))
  return map
}

/** Return true if adding edge from -> to would create a cycle */
function wouldCreateCycle(tasks: Task[], from: string, to: string) {
  const adj = buildAdjacency(tasks)
  // adding edge from -> to
  if (!adj.has(from)) adj.set(from, [])
  adj.get(from)!.push(to)

  // detect cycle using DFS
  const visited = new Set<string>()
  const onStack = new Set<string>()

  function dfs(n: string): boolean {
    if (!adj.has(n)) return false
    if (onStack.has(n)) return true
    if (visited.has(n)) return false

    visited.add(n)
    onStack.add(n)
    for (const nei of adj.get(n) || []) {
      if (dfs(nei)) return true
    }
    onStack.delete(n)
    return false
  }

  // run DFS for all nodes
  for (const node of adj.keys()) {
    if (!visited.has(node)) {
      if (dfs(node)) return true
    }
  }
  return false
}

export default function TaskDependenciesPanel({ taskId, open, onClose, onUpdated }: Props) {
  const params = useParams({ from: '/workspace/$workspaceId/tasks' })
  const workspaceId = (params as any).workspaceId as string | undefined

  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [currentTask, setCurrentTask] = useState<Task | null>(null)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [operationInProgress, setOperationInProgress] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        // Try to load tasks for workspace via apiClient
        const res = typeof (apiClient as any).getTasks === 'function'
          ? await (apiClient as any).getTasks(workspaceId)
          : { data: { tasks: [] } }

        const tasks: Task[] = res && res.data && Array.isArray(res.data.tasks) ? res.data.tasks : []

        if (!mounted) return
        setAllTasks(tasks)

        const t = tasks.find(tt => tt.id === String(taskId)) || null
        setCurrentTask(t)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tasks')
      } finally {
        setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [open, workspaceId, taskId])

  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return allTasks
      .filter(t => t.id !== String(taskId))
      .filter(t => !currentTask || !(currentTask.dependencies || []).includes(t.id))
      .filter(t => !q || t.title.toLowerCase().includes(q) || t.id.toString().includes(q))
  }, [allTasks, filter, currentTask, taskId])

  const handleAdd = async (depId: string) => {
    setValidationError(null)
    if (!currentTask) return
    const from = currentTask.id
    const to = depId
    if (from === to) {
      setValidationError('A task cannot depend on itself.')
      return
    }
    if (wouldCreateCycle(allTasks, from, to)) {
      setValidationError('Adding this dependency would create a circular dependency. Operation prevented.')
      return
    }

    setOperationInProgress(true)
    try {
      if (typeof (apiClient as any).addDependency === 'function') {
        await (apiClient as any).addDependency(String(from), String(to))
        // try to refetch tasks
        const res = typeof (apiClient as any).getTasks === 'function' ? await (apiClient as any).getTasks(workspaceId) : null
        if (res && res.data && Array.isArray(res.data.tasks)) {
          setAllTasks(res.data.tasks)
          const updated = res.data.tasks.find((t: Task) => t.id === String(from))
          setCurrentTask(updated || null)
          if (onUpdated && updated) onUpdated(updated)
        } else {
          // fallback: update local copy
          const updated = { ...currentTask, dependencies: [...(currentTask.dependencies || []), to] }
          setCurrentTask(updated)
          setAllTasks(prev => prev.map(p => p.id === updated.id ? updated : p))
          if (onUpdated) onUpdated(updated)
        }
      } else {
        // Simulate API: local in-memory update
        const updated = { ...currentTask, dependencies: [...(currentTask.dependencies || []), to] }
        setCurrentTask(updated)
        setAllTasks(prev => prev.map(p => p.id === updated.id ? updated : p))
        await new Promise(resolve => setTimeout(resolve, 300))
        if (onUpdated) onUpdated(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add dependency')
    } finally {
      setOperationInProgress(false)
    }
  }

  const handleRemove = async (depId: string) => {
    if (!currentTask) return
    const confirmed = window.confirm(`Remove dependency ${depId} from task ${currentTask.id}?`)
    if (!confirmed) return

    setOperationInProgress(true)
    try {
      if (typeof (apiClient as any).removeDependency === 'function') {
        await (apiClient as any).removeDependency(String(currentTask.id), String(depId))
        const res = typeof (apiClient as any).getTasks === 'function' ? await (apiClient as any).getTasks(workspaceId) : null
        if (res && res.data && Array.isArray(res.data.tasks)) {
          setAllTasks(res.data.tasks)
          const updated = res.data.tasks.find((t: Task) => t.id === String(currentTask.id))
          setCurrentTask(updated || null)
          if (onUpdated && updated) onUpdated(updated)
        } else {
          const updated = { ...currentTask, dependencies: (currentTask.dependencies || []).filter(d => d !== depId) }
          setCurrentTask(updated)
          setAllTasks(prev => prev.map(p => p.id === updated.id ? updated : p))
          if (onUpdated) onUpdated(updated)
        }
      } else {
        // Simulate local removal
        const updated = { ...currentTask, dependencies: (currentTask.dependencies || []).filter(d => d !== depId) }
        setCurrentTask(updated)
        setAllTasks(prev => prev.map(p => p.id === updated.id ? updated : p))
        await new Promise(resolve => setTimeout(resolve, 250))
        if (onUpdated) onUpdated(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove dependency')
    } finally {
      setOperationInProgress(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deps-panel-title"
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose()} />
      <Card className="relative max-w-2xl w-full z-50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="deps-panel-title" className="text-lg font-semibold">Task Dependencies</h3>
              <p className="text-sm text-muted-foreground">
                Manage dependencies for task {String(taskId)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => onClose()}>Close</Button>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading tasks...</div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : (
              <>
                <div>
                  <h4 className="text-sm font-medium">Current Dependencies</h4>
                  <div className="mt-2 space-y-2">
                    {currentTask && currentTask.dependencies && currentTask.dependencies.length > 0 ? (
                      currentTask.dependencies.map(depId => {
                        const depTask = allTasks.find(t => t.id === depId)
                        return (
                          <div key={depId} className="flex items-center justify-between border p-2 rounded">
                            <div>
                              <div className="text-sm font-medium">{depTask ? depTask.title : depId}</div>
                              <div className="text-xs text-muted-foreground">{depTask ? depTask.id : depId}</div>
                            </div>
                            <div>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemove(depId)}
                                disabled={operationInProgress}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-sm text-muted-foreground">No dependencies</div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium">Add Dependency</h4>
                  <div className="mt-2">
                    <Input
                      placeholder="Search tasks by id or title..."
                      value={filter}
                      onChange={(e: any) => setFilter(e.target.value)}
                      aria-label="Search tasks"
                    />
                    {validationError && (
                      <div className="text-sm text-red-600 mt-2">{validationError}</div>
                    )}
                    <div className="mt-2 max-h-56 overflow-auto space-y-2">
                      {candidates.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No matching tasks</div>
                      ) : candidates.map(c => (
                        <div key={c.id} className="flex items-center justify-between border p-2 rounded">
                          <div>
                            <div className="text-sm font-medium">{c.title}</div>
                            <div className="text-xs text-muted-foreground">{c.id}</div>
                          </div>
                          <div>
                            <Button onClick={() => handleAdd(c.id)} disabled={operationInProgress}>
                              Add
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      <Textarea value={currentTask?.notes || ''} readOnly placeholder="Task notes" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}