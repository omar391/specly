/**
 * Central registry for all Specly tool names
 * 
 * This file serves as the single source of truth for tool name validation
 * and prevents duplication across CLI, MCP server, and other components.
 */

// String enum for all Specly tools
export enum ToolNames {
    INIT = 'specly_init',
    START = 'specly_start',
    ADD = 'specly_add',
    STATUS = 'specly_status',
    UPDATE = 'specly_update',
    AUDIT = 'specly_audit',
    FOCUS = 'specly_focus',
    GITHUB = 'specly_github',
    RULE_UPDATE = 'specly_rule_update',
    REMOTE_INTERFACE = 'specly_remote_interface',
    UPDATE_RESOURCES = 'specly_update_resources',
    UPDATE_STEPS = 'specly_update_steps'
}

// Array of tool names for iteration (derived from enum values)
export const TOOL_NAMES = Object.values(ToolNames);

// Type for tool names - ensures compile-time validation
export type ToolName = ToolNames;

// Utility function for tool name validation
export function isValidToolName(name: string): name is ToolNames {
    return Object.values(ToolNames).includes(name as ToolNames);
}

// Tool name validation with error message
export function validateToolName(name: string): void {
    if (!isValidToolName(name)) {
        throw new Error(`Unknown tool: ${name}. Available tools: ${Object.values(ToolNames).join(', ')}`);
    }
}

// Default export for convenience
export default ToolNames;
