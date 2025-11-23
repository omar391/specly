import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaskBoard } from '@/components/tasks/task-board'
import { describe, it, expect, vi } from 'vitest'
import { Task } from '@/lib/types'
import { DndContext } from '@dnd-kit/core'

// Mock DndContext to avoid issues with drag and drop in test environment if needed
// But standard testing-library interactions might be enough for basic rendering

const mockTasks: Task[] = [
    {
        id: 'task-1',
        title: 'Task 1',
        description: 'Description 1',
        status: 'pending',
        priority: 'high',
        progress: 0,
        assets: [],
        external_references: [],
        metadata: {},
        tags: [],
        notes: null,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        completed_at: null
    },
    {
        id: 'task-2',
        title: 'Task 2',
        description: 'Description 2',
        status: 'in_progress',
        priority: 'medium',
        progress: 50,
        assets: [],
        external_references: [],
        metadata: {},
        tags: [],
        notes: null,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        completed_at: null
    }
]

describe('TaskBoard', () => {
    it('renders tasks in correct columns', () => {
        const handleUpdateStatus = vi.fn()
        render(<TaskBoard tasks={mockTasks} onUpdateStatus={handleUpdateStatus} />)

        expect(screen.getByText('Task 1')).toBeInTheDocument()
        expect(screen.getByText('Task 2')).toBeInTheDocument()

        // Verify columns
        expect(screen.getByText('Pending')).toBeInTheDocument()
        expect(screen.getByText('In Progress')).toBeInTheDocument()
    })

    // Note: Testing drag and drop with dnd-kit in jsdom can be complex.
    // We'll focus on rendering for now.
})
