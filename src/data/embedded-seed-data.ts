/**
 * Embedded seed data for Specly initialization
 * Uses Drizzle ORM types for compile-time type safety
 */

import {
  type NewMcpServerMapping
} from '../database/schema/global-schema.js';
import { type CreateSpecInput, type CreateToolVersionInput } from '../repositories/spec-repository.js';

/**
 * Specly seed definitions (SP-004)
 * Logical keys map to spec definitions; tool definitions reference spec keys.
 */
export interface SeedSpecDefinition {
  key: string; // logical key used by tool definitions
  spec: CreateSpecInput;
}

export interface SeedToolDefinition {
  toolName: string;
  specKeys: string[]; // ordered specs keys
  entrySpecKey: string;
  edges?: CreateToolVersionInput['edges'];
}

export interface SeedProfileDefinition {
  profileName: string;
  toolNames: string[]; // attach latest version of each tool
  description?: string;
}

// Legacy tool flow and feedback step seeds removed (Specly schema migration).

// MCP Server Mappings - Drizzle typed seed data
export const MCP_SERVER_MAPPINGS_SEED: NewMcpServerMapping[] = [
  {
    id: "msm_github_001",
    interfaceType: "github",
    mcpServerName: "github-mcp",
    description: "GitHub MCP Server for repository and issue management",
    isDefault: true
  },
  {
    id: "msm_jira_001",
    interfaceType: "jira",
    mcpServerName: "jira-mcp",
    description: "Jira MCP Server for project and issue tracking",
    isDefault: true
  },
  {
    id: "msm_linear_001",
    interfaceType: "linear",
    mcpServerName: "linear-mcp",
    description: "Linear MCP Server for team issue tracking",
    isDefault: true
  },
  {
    id: "msm_asana_001",
    interfaceType: "asana",
    mcpServerName: "asana-mcp",
    description: "Asana MCP Server for project management",
    isDefault: true
  },
  {
    id: "msm_trello_001",
    interfaceType: "trello",
    mcpServerName: "trello-mcp",
    description: "Trello MCP Server for board management",
    isDefault: true
  },
  {
    id: "msm_custom_001",
    interfaceType: "custom",
    mcpServerName: "custom-rest-mcp",
    description: "Generic REST API MCP Server for custom integrations",
    isDefault: true
  }
];

// Legacy tool flow steps seed removed.

// ---------- Specly Seed Data (Initial Minimal Set) ----------

export const SPECLY_SEED_SPECS: SeedSpecDefinition[] = [
  {
    key: 'echo_spec_v1',
    spec: {
      executorType: 'generic-executor',
      executorVersion: '1.0.0',
      intent: 'human',
      sideEffect: false,
      contentTemplate: 'Echo: {{input}}',
      staticParams: {},
      inputSchema: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
      outputSchema: { type: 'object', properties: { output: { type: 'string' } } },
      idempotencyKeyTemplate: '{{input}}',
      retryPolicy: { max: 1 },
      showOutput: true,
      security: { allow: ['*'] },
      metadata: { seed: true, name: 'echo' }
    }
  },
  {
    key: 'list_tasks_spec_v1',
    spec: {
      executorType: 'task-query-executor',
      executorVersion: '1.0.0',
      intent: 'autonomous',
      sideEffect: false,
      contentTemplate: 'List recent tasks',
      staticParams: { limit: 20 },
      inputSchema: undefined,
      outputSchema: { type: 'object', properties: { tasks: { type: 'array', items: { type: 'object' } } } },
      idempotencyKeyTemplate: undefined,
      retryPolicy: undefined,
      showOutput: true,
      security: { allow: ['*'] },
      metadata: { seed: true, name: 'list_tasks' }
    }
  }
];

export const SPECLY_SEED_TOOLS: SeedToolDefinition[] = [
  {
    toolName: 'echo',
    specKeys: ['echo_spec_v1'],
    entrySpecKey: 'echo_spec_v1',
    edges: []
  },
  {
    toolName: 'list-tasks',
    specKeys: ['list_tasks_spec_v1'],
    entrySpecKey: 'list_tasks_spec_v1',
    edges: []
  }
];

export const SPECLY_ROOT_PROFILE: SeedProfileDefinition = {
  profileName: 'root-profile',
  description: 'Initial root profile containing base tools',
  toolNames: ['echo', 'list-tasks']
};

