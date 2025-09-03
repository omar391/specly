import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Workspace-specific database tables - stored in {workspace}/.taskpilot/task.db

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', {
    enum: ['backlog', 'in-progress', 'blocked', 'review', 'done', 'dropped']
  }).default('backlog'),
  priority: text('priority', {
    enum: ['high', 'medium', 'low']
  }).default('medium'),
  progress: integer('progress').default(0),
  dependencies: text('dependencies', { mode: 'json' }).default([]),
  notes: text('notes'),
  connectedFiles: text('connected_files', { mode: 'json' }).default([]),
  githubIssueNumber: integer('github_issue_number'),
  githubUrl: text('github_url'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  completedAt: text('completed_at')
});

export const githubConfigs = sqliteTable('github_configs', {
  id: text('id').primaryKey(),
  repoUrl: text('repo_url').notNull(),
  repoOwner: text('repo_owner').notNull(),
  repoName: text('repo_name').notNull(),
  githubToken: text('github_token').notNull(),
  autoSync: integer('auto_sync', { mode: 'boolean' }).default(false),
  syncDirection: text('sync_direction', {
    enum: ['bidirectional', 'github_to_taskpilot', 'taskpilot_to_github']
  }).default('bidirectional'),
  lastSync: text('last_sync'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

export const remoteInterfaces = sqliteTable('remote_interfaces', {
  id: text('id').primaryKey(),
  interfaceType: text('interface_type', {
    enum: ['github', 'jira', 'linear', 'asana', 'trello', 'custom']
  }).notNull(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  apiToken: text('api_token').notNull(),
  projectId: text('project_id'),
  syncEnabled: integer('sync_enabled', { mode: 'boolean' }).default(true),
  syncDirection: text('sync_direction', {
    enum: ['bidirectional', 'import_only', 'export_only']
  }).default('bidirectional'),
  fieldMappings: text('field_mappings', { mode: 'json' }).default([]),
  lastSync: text('last_sync'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});


// -------------------------------------------------------------
// Specly New Workspace Schema (SP-001)
// Legacy tasks table retained until data migration & code refactor complete.
// New tables suffixed with New to avoid naming collision temporarily.
// -------------------------------------------------------------

export const tasksNew = sqliteTable('tasks_new', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum: ['queued', 'in_progress', 'awaiting_input', 'blocked', 'paused', 'completed', 'failed'] }).default('queued'),
  priority: text('priority', { enum: ['high', 'medium', 'low'] }).default('medium'),
  progress: integer('progress').default(0),
  notes: text('notes'),
  profileVersionId: text('profile_version_id'),
  blockedReason: text('blocked_reason'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  completedAt: text('completed_at')
});

export const taskDependencies = sqliteTable('task_dependencies', {
  taskId: text('task_id').notNull(),
  dependsOnTaskId: text('depends_on_task_id').notNull()
});

export const sessionsNew = sqliteTable('sessions_new', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  taskId: text('task_id'),
  profileVersionId: text('profile_version_id'),
  currentSpecHash: text('current_spec_hash'),
  status: text('status', { enum: ['active', 'idle'] }).default('active'),
  clientStateId: text('client_state_id'),
  lastActiveAt: text('last_active_at').default(sql`CURRENT_TIMESTAMP`),
  context: text('context', { mode: 'json' }).default({}),
  lastResultCode: text('last_result_code'),
  humanBlocking: integer('human_blocking', { mode: 'boolean' }).default(false),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// Export types for use in other files
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type GithubConfig = typeof githubConfigs.$inferSelect;
export type NewGithubConfig = typeof githubConfigs.$inferInsert;
export type RemoteInterface = typeof remoteInterfaces.$inferSelect;
export type NewRemoteInterface = typeof remoteInterfaces.$inferInsert;

export type TaskNew = typeof tasksNew.$inferSelect;
export type NewTaskNew = typeof tasksNew.$inferInsert;
export type TaskDependency = typeof taskDependencies.$inferSelect;
export type SessionNew = typeof sessionsNew.$inferSelect;
