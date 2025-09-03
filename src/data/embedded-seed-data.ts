/**
 * Embedded seed data for TaskPilot initialization
 * Uses Drizzle ORM types for compile-time type safety
 */

import {
  type NewMcpServerMapping
} from '../database/schema/global-schema.js';

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
