import { useState, useMemo } from 'react'
import { DndContext, DragOverlay, useDroppable, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { type Task } from '@/lib/types'
import { createPortal } from 'react-dom'

interface TaskBoardProps {
    tasks: Task[]
    onUpdateStatus: (taskId: string, status: string) => void
}

const COLUMNS = [
    { id: 'pending', title: 'Pending' },
    { id: 'in_progress', title: 'In Progress' },
    { id: 'completed', title: 'Completed' },
    { id: 'failed', title: 'Failed' },
]

export function TaskBoard({ tasks, onUpdateStatus }: TaskBoardProps) {
    const [activeId, setActiveId] = useState<string | null>(null)

    const columns = useMemo(() => {
        const cols: Record<string, Task[]> = {
            pending: [],
            in_progress: [],
            completed: [],
            failed: []
        }
        tasks.forEach(task => {
            if (cols[task.status]) {
                cols[task.status].push(task)
            } else {
                // Fallback for unknown statuses
                cols.pending.push(task)
            }
        })
        return cols
    }, [tasks])

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string)
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)

        if (!over) return

        const activeTask = tasks.find(t => t.id === active.id)
        if (!activeTask) return

        // If dropped over a column container
        if (COLUMNS.some(c => c.id === over.id)) {
            if (activeTask.status !== over.id) {
                onUpdateStatus(activeTask.id, over.id as string)
            }
            return
        }

        // If dropped over another item, find its column
        const overTask = tasks.find(t => t.id === over.id)
        if (overTask && activeTask.status !== overTask.status) {
            onUpdateStatus(activeTask.id, overTask.status)
        }
    }

    return (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-[calc(100vh-200px)]">
                {COLUMNS.map(col => (
                    <BoardColumn
                        key={col.id}
                        id={col.id}
                        title={col.title}
                        tasks={columns[col.id] || []}
                    />
                ))}
            </div>
            {createPortal(
                <DragOverlay>
                    {activeId ? (
                        <TaskCard task={tasks.find(t => t.id === activeId)!} isOverlay />
                    ) : null}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    )
}

function BoardColumn({ id, title, tasks }: { id: string, title: string, tasks: Task[] }) {
    const { setNodeRef } = useDroppable({ id })

    return (
        <div ref={setNodeRef} className="flex flex-col h-full bg-white/5 rounded-lg border border-white/10">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
                <h3 className="font-medium text-sm">{title}</h3>
                <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px]">
                <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {tasks.map(task => (
                        <SortableTaskItem key={task.id} task={task} />
                    ))}
                </SortableContext>
            </div>
        </div>
    )
}

function SortableTaskItem({ task }: { task: Task }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: task.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    }

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <TaskCard task={task} />
        </div>
    )
}

function TaskCard({ task, isOverlay }: { task: Task, isOverlay?: boolean }) {
    return (
        <Card className={cn(
            "cursor-grab active:cursor-grabbing hover:bg-white/10 transition-colors",
            isOverlay ? "shadow-xl rotate-2 bg-background border-primary/50" : "bg-white/5"
        )}>
            <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-tight line-clamp-2">{task.title}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] h-4 px-1">{task.id}</Badge>
                    <span>{task.priority}</span>
                </div>
            </CardContent>
        </Card>
    )
}
