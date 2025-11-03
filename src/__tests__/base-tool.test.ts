/**
 * Basic validation test for the new BaseTool interface
 */

import { describe, it, expect } from 'vitest';
import { AddToolNew } from '../tools/add.js';
import { BaseTool } from '../tools/base-tool.js';

describe('Base Tool Interface Validation', () => {
  // This test doesn't require actual database calls, just validates the interface
  
  it('should have proper inheritance structure', () => {
    // The class should exist and be properly defined
    expect(AddToolNew).toBeDefined();
    expect(typeof AddToolNew).toBe('function');
  });

  it('should have static getToolDefinition method', () => {
    const definition = AddToolNew.getToolDefinition();
    
    expect(definition).toBeDefined();
    expect(definition.name).toBe('specly_add');
    expect(definition.description).toContain('Multi-step task creation');
    expect(definition.inputSchema).toBeDefined();
    expect(definition.inputSchema.properties).toHaveProperty('stepId');
    expect(definition.inputSchema.properties).toHaveProperty('task_description');
    expect(definition.inputSchema.properties).toHaveProperty('workspace_path');
    expect(definition.inputSchema.required).toContain('task_description');
    expect(definition.inputSchema.required).toContain('workspace_path');
  });

  it('should have proper stepId enum structure', () => {
    const definition = AddToolNew.getToolDefinition();
    const stepIdProperty = definition.inputSchema.properties.stepId;
    
    expect(stepIdProperty).toBeDefined();
    expect(stepIdProperty.type).toBe('string');
    expect(stepIdProperty.enum).toEqual(['validate', 'create']);
    expect(stepIdProperty.description).toContain('Optional step ID');
  });

  it('should validate tool schema structure', () => {
    const definition = AddToolNew.getToolDefinition();
    
    // Should have all expected properties
    const properties = definition.inputSchema.properties;
    expect(properties).toHaveProperty('stepId');
    expect(properties).toHaveProperty('task_description');
    expect(properties).toHaveProperty('workspace_path');
    expect(properties).toHaveProperty('priority');
    expect(properties).toHaveProperty('parent_task_id');
    
    // Priority should have enum values
    expect(properties.priority.enum).toEqual(['High', 'Medium', 'Low']);
  });
});
