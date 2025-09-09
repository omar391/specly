import React from 'react'
import { cn } from '@/lib/utils'

export type StatusValue = 'backlog' | 'in_progress' | 'blocked' | 'review' | 'done' | 'dropped'

interface Props {
  status: StatusValue | string
  small?: boolean
}

const STATUS_MAP: Record<StatusValue, { label: string; bg: string; fg: string }> = {
  backlog: { label: 'Backlog', bg: 'bg-gray-100 dark:bg-gray-800', fg: 'text-gray-800 dark:text-gray-200' },
  in_progress: { label: 'In Progress', bg: 'bg-blue-100 dark:bg-blue-900', fg: 'text-blue-800 dark:text-blue-200' },
  blocked: { label: 'Blocked', bg: 'bg-red-100 dark:bg-red-900', fg: 'text-red-800 dark:text-red-200' },
  review: { label: 'In Review', bg: 'bg-yellow-100 dark:bg-yellow-900', fg: 'text-yellow-800 dark:text-yellow-200' },
  done: { label: 'Done', bg: 'bg-green-100 dark:bg-green-900', fg: 'text-green-800 dark:text-green-200' },
  dropped: { label: 'Dropped', bg: 'bg-gray-50 dark:bg-gray-900', fg: 'text-gray-600 dark:text-gray-400' },
}

export default function StatusBadge({ status, small }: Props) {
  // Normalize some common variants
  const normalized = (status || '').toString()
    .replace(/\s+/g, '-')
    .replace(/-/g, '_')
    .toLowerCase()

  const key = (Object.keys(STATUS_MAP) as StatusValue[]).includes(normalized as StatusValue)
    ? (normalized as StatusValue)
    : 'backlog'

  const { label, bg, fg } = STATUS_MAP[key]

  return (
    <span
      role="status"
      aria-label={`Status: ${label}`}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        small ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2 py-0.5',
        bg,
        fg
      )}
    >
      {label}
    </span>
  )
}