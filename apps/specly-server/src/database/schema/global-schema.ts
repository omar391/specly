import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Global database tables - stored in ~/.specly/global.db

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  name: text('name').notNull(),
  status: text('status', { 
    enum: ['active', 'idle', 'inactive', 'disconnected', 'error'] 
  }).default('disconnected'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  lastActivity: text('last_activity'),
  taskCount: integer('task_count').default(0),
  activeTask: text('active_task')
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  lastActivity: text('last_activity').default(sql`CURRENT_TIMESTAMP`),
  isActive: integer('is_active', { mode: 'boolean' }).default(true)
});


export const mcpServerMappings = sqliteTable('mcp_server_mappings', {
  id: text('id').primaryKey(),
  interfaceType: text('interface_type', {
    enum: ['github', 'jira', 'linear', 'asana', 'trello', 'custom']
  }).notNull(),
  mcpServerName: text('mcp_server_name').notNull(),
  description: text('description'),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

// -------------------------------------------------------------
// Specly Global Schema (SP-001)
// -------------------------------------------------------------

export const specs = sqliteTable('specs', {
  hash: text('hash').primaryKey(),
  executorType: text('executor_type').notNull(),
  executorVersion: text('executor_version').notNull(),
  intent: text('intent', { enum: ['human', 'autonomous'] }).notNull(),
  sideEffect: integer('side_effect', { mode: 'boolean' }).default(false),
  contentTemplate: text('content_template'),
  staticParams: text('static_params', { mode: 'json' }).default({}),
  inputSchema: text('input_schema', { mode: 'json' }),
  outputSchema: text('output_schema', { mode: 'json' }),
  idempotencyKeyTemplate: text('idempotency_key_template'),
  retryPolicy: text('retry_policy', { mode: 'json' }),
  showOutput: integer('show_output', { mode: 'boolean' }).default(true),
  security: text('security', { mode: 'json' }),
  metadata: text('metadata', { mode: 'json' }).default({}),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

export const toolVersions = sqliteTable('tool_versions', {
  hash: text('hash').primaryKey(),
  toolName: text('tool_name').notNull(),
  graphManifest: text('graph_manifest', { mode: 'json' }).notNull(), // {ordered_specs, edges, entry_spec}
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

export const tools = sqliteTable('tools', {
  name: text('name').primaryKey(),
  commandAlias: text('command_alias').unique(),
  description: text('description'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// Self-referential tables need two-step pattern to satisfy TS without implicit any.
export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  // parentProfileId forward reference resolved post variable creation
  parentProfileId: text('parent_profile_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

export const profileVersions = sqliteTable('profile_versions', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull(),
  parentProfileVersionId: text('parent_profile_version_id'),
  version: integer('version').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// Reference setup comments: Drizzle's references() helper causes TS self-reference warnings when inline.
// We'll handle FK constraints via migration SQL already; runtime code can add manual guards if needed.

export const profileVersionTools = sqliteTable('profile_version_tools', {
  id: text('id').primaryKey(),
  profileVersionId: text('profile_version_id').notNull().references(() => profileVersions.id, { onDelete: 'cascade' }),
  toolName: text('tool_name').notNull().references(() => tools.name, { onDelete: 'cascade' }),
  toolVersionHash: text('tool_version_hash').notNull().references(() => toolVersions.hash, { onDelete: 'cascade' }),
  commandAlias: text('command_alias'),
  inheritedFromProfileVersionId: text('inherited_from_profile_version_id').references(() => profileVersions.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

export const workspaceProfileVersions = sqliteTable('workspace_profile_versions', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }).primaryKey(),
  profileVersionId: text('profile_version_id').notNull().references(() => profileVersions.id),
  pinnedAt: text('pinned_at').default(sql`CURRENT_TIMESTAMP`)
});

export const actionJournal = sqliteTable('action_journal', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  specHash: text('spec_hash').notNull().references(() => specs.hash, { onDelete: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status', { enum: ['pending', 'success', 'failed'] }).notNull(),
  attempts: integer('attempts').default(0),
  lastErrorCode: text('last_error_code'),
  resultJson: text('result_json', { mode: 'json' }),
  errorJson: text('error_json', { mode: 'json' }),
  startedAt: text('started_at').default(sql`CURRENT_TIMESTAMP`),
  completedAt: text('completed_at')
});

export const workspaceRulesNew = sqliteTable('workspace_rules', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  relation: text('relation', { enum: ['always-do', 'never-do', 'is-a', 'has-a'] }).notNull(),
  rule: text('rule').notNull(),
  originalText: text('original_text'),
  confidence: integer('confidence').default(1),
  sourceSessionId: text('source_session_id'),
  active: integer('active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  lastReinforcedAt: text('last_reinforced_at')
});

// Export types for use in other files
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type McpServerMapping = typeof mcpServerMappings.$inferSelect;
export type NewMcpServerMapping = typeof mcpServerMappings.$inferInsert;

export type Spec = typeof specs.$inferSelect;
export type NewSpec = typeof specs.$inferInsert;
export type ToolVersion = typeof toolVersions.$inferSelect;
export type NewToolVersion = typeof toolVersions.$inferInsert;
export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type ProfileVersion = typeof profileVersions.$inferSelect;
export type NewProfileVersion = typeof profileVersions.$inferInsert;
export type ProfileVersionTool = typeof profileVersionTools.$inferSelect;
export type NewProfileVersionTool = typeof profileVersionTools.$inferInsert;
export type WorkspaceProfileVersion = typeof workspaceProfileVersions.$inferSelect;
export type NewWorkspaceProfileVersion = typeof workspaceProfileVersions.$inferInsert;
export type ActionJournalEntry = typeof actionJournal.$inferSelect;
export type NewActionJournalEntry = typeof actionJournal.$inferInsert;
