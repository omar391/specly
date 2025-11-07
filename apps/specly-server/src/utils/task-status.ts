// Centralized Specly task status transitions utility
// Statuses: queued | in_progress | awaiting_input | blocked | paused | completed | failed

export type TaskStatus =
  | 'queued'
  | 'in_progress'
  | 'awaiting_input'
  | 'blocked'
  | 'paused'
  | 'completed'
  | 'failed';

export interface TransitionOptions {
  // If true and the task has unresolved dependencies, disallow in_progress/completed
  hasUnresolvedDependencies?: boolean;
}

export interface TransitionCheckResult {
  ok: boolean;
  reason?: string;
}

const baseTransitions: Record<TaskStatus, TaskStatus[]> = {
  queued: ['in_progress', 'blocked', 'paused', 'failed'],
  in_progress: ['awaiting_input', 'blocked', 'paused', 'completed', 'failed'],
  awaiting_input: ['in_progress', 'paused', 'failed'],
  blocked: ['in_progress', 'paused', 'failed'],
  paused: ['in_progress', 'blocked', 'failed'],
  completed: [],
  failed: [],
};

/** Returns the allowed next statuses from a given status, without considering guardrails. */
export function nextStatuses(from: TaskStatus): TaskStatus[] {
  return baseTransitions[from] ?? [];
}

/** Validates a transition with optional guardrails (e.g., dependency checks). */
export function canTransition(
  from: TaskStatus,
  to: TaskStatus,
  opts: TransitionOptions = {}
): TransitionCheckResult {
  const allowed = baseTransitions[from] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, reason: `Invalid status transition: ${from} -> ${to}` };
  }

  // Guard: unresolved dependencies block entering in_progress or completed
  if (opts.hasUnresolvedDependencies && (to === 'in_progress' || to === 'completed')) {
    return { ok: false, reason: 'Task has unresolved dependencies' };
  }

  return { ok: true };
}

/** Ensures a provided status value is a valid TaskStatus or throws. */
export function assertValidStatus(value: string): asserts value is TaskStatus {
  const all: TaskStatus[] = [
    'queued',
    'in_progress',
    'awaiting_input',
    'blocked',
    'paused',
    'completed',
    'failed',
  ];
  if (!all.includes(value as TaskStatus)) {
    throw new Error(`Invalid status value: ${value}`);
  }
}
