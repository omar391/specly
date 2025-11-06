-- SP-001 Specly core schema migration
-- Creates new Specly tables alongside legacy ones. Legacy tables will be dropped in a later migration after code cutover.

BEGIN TRANSACTION;

-- Global DB tables
CREATE TABLE IF NOT EXISTS "specs" (
  "hash" text PRIMARY KEY NOT NULL,
  "executor_type" text NOT NULL,
  "executor_version" text NOT NULL,
  "intent" text NOT NULL,
  "side_effect" integer DEFAULT 0,
  "content_template" text,
  "static_params" text,
  "input_schema" text,
  "output_schema" text,
  "idempotency_key_template" text,
  "retry_policy" text,
  "show_output" integer DEFAULT 1,
  "security" text,
  "metadata" text,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS "tool_versions" (
  "hash" text PRIMARY KEY NOT NULL,
  "tool_name" text NOT NULL,
  "graph_manifest" text NOT NULL,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS "tools" (
  "name" text PRIMARY KEY NOT NULL,
  "command_alias" text UNIQUE,
  "description" text,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS "profiles" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "description" text,
  "parent_profile_id" text,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY ("parent_profile_id") REFERENCES "profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "profile_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "profile_id" text NOT NULL,
  "parent_profile_version_id" text,
  "version" integer NOT NULL,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  FOREIGN KEY ("parent_profile_version_id") REFERENCES "profile_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "profile_version_tools" (
  "id" text PRIMARY KEY NOT NULL,
  "profile_version_id" text NOT NULL,
  "tool_name" text NOT NULL,
  "tool_version_hash" text NOT NULL,
  "command_alias" text,
  "inherited_from_profile_version_id" text,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY ("profile_version_id") REFERENCES "profile_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  FOREIGN KEY ("tool_name") REFERENCES "tools"("name") ON DELETE CASCADE ON UPDATE NO ACTION,
  FOREIGN KEY ("tool_version_hash") REFERENCES "tool_versions"("hash") ON DELETE CASCADE ON UPDATE NO ACTION,
  FOREIGN KEY ("inherited_from_profile_version_id") REFERENCES "profile_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_pvt_tool" ON "profile_version_tools" ("profile_version_id","tool_name");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_pvt_alias" ON "profile_version_tools" ("profile_version_id","command_alias");

CREATE TABLE IF NOT EXISTS "workspace_profile_versions" (
  "workspace_id" text PRIMARY KEY NOT NULL,
  "profile_version_id" text NOT NULL,
  "pinned_at" text DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  FOREIGN KEY ("profile_version_id") REFERENCES "profile_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS "action_journal" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "spec_hash" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" text NOT NULL,
  "attempts" integer DEFAULT 0,
  "last_error_code" text,
  "result_json" text,
  "error_json" text,
  "started_at" text DEFAULT (CURRENT_TIMESTAMP),
  "completed_at" text,
  FOREIGN KEY ("spec_hash") REFERENCES "specs"("hash") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_action_journal_idem" ON "action_journal" ("spec_hash","session_id","idempotency_key");

CREATE TABLE IF NOT EXISTS "workspace_rules" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "relation" text NOT NULL,
  "rule" text NOT NULL,
  "original_text" text,
  "confidence" integer DEFAULT 1,
  "source_session_id" text,
  "active" integer DEFAULT 1,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP),
  "last_reinforced_at" text,
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_workspace_rule" ON "workspace_rules" ("workspace_id","relation","rule");

-- Workspace DB tables (prefixed names to avoid collision until cutover)
CREATE TABLE IF NOT EXISTS "tasks_new" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'queued',
  "priority" text DEFAULT 'medium',
  "progress" integer DEFAULT 0,
  "notes" text,
  "profile_version_id" text,
  "blocked_reason" text,
  "deleted_at" text,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP),
  "updated_at" text DEFAULT (CURRENT_TIMESTAMP),
  "completed_at" text
);

CREATE TABLE IF NOT EXISTS "task_dependencies" (
  "task_id" text NOT NULL,
  "depends_on_task_id" text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_task_dep" ON "task_dependencies" ("task_id","depends_on_task_id");

CREATE TABLE IF NOT EXISTS "sessions_new" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "task_id" text,
  "profile_version_id" text,
  "current_spec_hash" text,
  "status" text DEFAULT 'active',
  "client_state_id" text,
  "last_active_at" text DEFAULT (CURRENT_TIMESTAMP),
  "context" text,
  "last_result_code" text,
  "human_blocking" integer DEFAULT 0,
  "deleted_at" text,
  "created_at" text DEFAULT (CURRENT_TIMESTAMP)
);

COMMIT;
