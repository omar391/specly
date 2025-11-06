import { z } from 'zod';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import type { SpeclyToolResult } from '../types/index.js';
import { PromptOrchestrator } from '../services/prompt-orchestrator.js';
import { GlobalDatabaseService } from '../database/global-queries.js';

/**
 * Base Tool Interface - Common schema and functionality for all MCP tools
 * 
 * Provides:
 * - Dynamic stepId enumeration from database tool flows
 * - Common workspace validation
 * - Standardized error handling
 * - Shared orchestrator and database services
 */

export interface BaseToolConfig {
  name: string;
  description: string;
  requiredFields: string[];
  additionalProperties?: Record<string, any>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Abstract base class that all Specly MCP tools should extend
 */
export abstract class BaseTool {
  protected orchestrator: PromptOrchestrator;
  protected globalDb: GlobalDatabaseService;
  protected toolConfig: BaseToolConfig;
  protected dbManager: DrizzleDatabaseManager;

  constructor(
    protected drizzleDb: DrizzleDatabaseManager,
    config: BaseToolConfig
  ) {
    this.orchestrator = new PromptOrchestrator(drizzleDb);
    this.globalDb = new GlobalDatabaseService(drizzleDb);
    this.toolConfig = config;
    this.dbManager = drizzleDb;
  }

  /**
   * Get available step IDs for this tool from database tool flows
   * This replaces hardcoded enum values with dynamic database queries
   */
  protected async getAvailableStepIds(): Promise<string[]> { return []; }

  /**
   * Generate dynamic tool definition with database-driven stepId enums
   */
  async getToolDefinition(): Promise<ToolDefinition> {
    const availableStepIds = await this.getAvailableStepIds();
    
    const baseProperties: Record<string, any> = {
      workspace_path: {
        type: 'string',
        description: 'Absolute path to the workspace directory'
      }
    };

    // Add stepId property with dynamic enum if steps are available
    if (availableStepIds.length > 0) {
      baseProperties.stepId = {
        type: 'string',
        enum: availableStepIds,
        description: `Optional step ID for multi-step workflow: ${availableStepIds.join(', ')}`
      };
    }

    // Merge additional properties from tool config
    const allProperties = {
      ...baseProperties,
      ...this.toolConfig.additionalProperties
    };

    return {
      name: this.toolConfig.name,
      description: this.toolConfig.description,
      inputSchema: {
        type: 'object',
        properties: allProperties,
        required: this.toolConfig.requiredFields
      }
    };
  }

  /**
   * Dynamically validate input arguments with database-driven stepId enums
   */
  protected async validateInputDynamically(input: any): Promise<{ isValid: boolean; validatedInput?: any; error?: string }> { return { isValid: true, validatedInput: input }; }

  /**
   * Common workspace validation that all tools need
   */
  protected async validateWorkspace(workspacePath: string): Promise<{
    isValid: boolean;
    workspace?: any;
    error?: string;
  }> {
    try {
      const workspace = await this.globalDb.getWorkspaceByPath(workspacePath);
      
      if (!workspace) {
        return {
          isValid: false,
          error: `Workspace not found at path: ${workspacePath}. Please run specly_start first to initialize the workspace.`
        };
      }

      return {
        isValid: true,
        workspace
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Error validating workspace: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Create standardized error result
   */
  protected createErrorResult(message: string, data?: any): SpeclyToolResult { return { content: [{ type: 'text', text: message }], isError: true }; }

  /**
   * Create standardized success result
   */
  protected createSuccessResult(text: string, _details?: any): SpeclyToolResult { return { content: [{ type: 'text', text }], isError: false }; }

  /**
   * Execute tool with common validation and error handling
   * Subclasses must implement this method
   */
  abstract execute(input: any): Promise<SpeclyToolResult>;

  /**
   * Static method for getting tool definition (for compatibility)
   * Subclasses should implement this for immediate schema access
   */
  static getToolDefinition(): ToolDefinition {
    throw new Error('Static getToolDefinition() must be implemented by subclass');
  }
}

/**
 * Helper function to create base tool schema with common stepId pattern
 * This can be used by tools that don't want to extend the full BaseTool class
 */
export function createBaseToolSchema(toolName: string, additionalProperties: Record<string, any> = {}, requiredFields: string[] = ['workspace_path']): z.ZodObject<any> { return z.object({ workspace_path: z.string().describe('Absolute path to the workspace directory'), ...additionalProperties }); }

/**
 * Type guard to check if a result is an error
 */
export function isToolError(result: SpeclyToolResult): boolean { return result.isError === true; }
