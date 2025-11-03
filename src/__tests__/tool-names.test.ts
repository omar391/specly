/**
 * Tests for Tool Names Constants
 * 
 * Tests tool name validation, enum consistency, and type guards
 */

import { describe, it, expect } from 'vitest';
import { ToolNames, TOOL_NAMES, isValidToolName, validateToolName } from '../constants/tool-names.js';

describe('Tool Names', () => {
  describe('ToolNames Enum', () => {
    it('should define INIT tool', () => {
      expect(ToolNames.INIT).toBe('taskpilot_init');
    });

    it('should define START tool', () => {
      expect(ToolNames.START).toBe('taskpilot_start');
    });

    it('should define ADD tool', () => {
      expect(ToolNames.ADD).toBe('taskpilot_add');
    });

    it('should define STATUS tool', () => {
      expect(ToolNames.STATUS).toBe('taskpilot_status');
    });

    it('should define UPDATE tool', () => {
      expect(ToolNames.UPDATE).toBe('taskpilot_update');
    });

    it('should define AUDIT tool', () => {
      expect(ToolNames.AUDIT).toBe('taskpilot_audit');
    });

    it('should define FOCUS tool', () => {
      expect(ToolNames.FOCUS).toBe('taskpilot_focus');
    });

    it('should define GITHUB tool', () => {
      expect(ToolNames.GITHUB).toBe('taskpilot_github');
    });

    it('should define RULE_UPDATE tool', () => {
      expect(ToolNames.RULE_UPDATE).toBe('taskpilot_rule_update');
    });

    it('should define REMOTE_INTERFACE tool', () => {
      expect(ToolNames.REMOTE_INTERFACE).toBe('taskpilot_remote_interface');
    });

    it('should define UPDATE_RESOURCES tool', () => {
      expect(ToolNames.UPDATE_RESOURCES).toBe('taskpilot_update_resources');
    });

    it('should define UPDATE_STEPS tool', () => {
      expect(ToolNames.UPDATE_STEPS).toBe('taskpilot_update_steps');
    });

    it('should have consistent taskpilot_ prefix', () => {
      const allValues = Object.values(ToolNames);
      for (const value of allValues) {
        expect(value).toMatch(/^taskpilot_/);
      }
    });

    it('should have lowercase snake_case names', () => {
      const allValues = Object.values(ToolNames);
      for (const value of allValues) {
        expect(value).toMatch(/^[a-z_]+$/);
      }
    });

    it('should have unique values', () => {
      const values = Object.values(ToolNames);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('should have exactly 12 tools', () => {
      const toolCount = Object.keys(ToolNames).length;
      expect(toolCount).toBe(12);
    });
  });

  describe('TOOL_NAMES Array', () => {
    it('should contain all enum values', () => {
      const enumValues = Object.values(ToolNames);
      expect(TOOL_NAMES).toHaveLength(enumValues.length);
      
      for (const value of enumValues) {
        expect(TOOL_NAMES).toContain(value);
      }
    });

    it('should be iterable', () => {
      let count = 0;
      for (const name of TOOL_NAMES) {
        count++;
        expect(typeof name).toBe('string');
      }
      expect(count).toBeGreaterThan(0);
    });

    it('should allow filtering', () => {
      const updateTools = TOOL_NAMES.filter(name => name.includes('update'));
      expect(updateTools.length).toBeGreaterThan(0);
      expect(updateTools).toContain('taskpilot_update');
    });

    it('should allow mapping', () => {
      const upperCaseNames = TOOL_NAMES.map(name => name.toUpperCase());
      expect(upperCaseNames).toContain('TASKPILOT_INIT');
    });

    it('should maintain order consistency', () => {
      // Array should maintain consistent order across runs
      const names1 = [...TOOL_NAMES];
      const names2 = [...TOOL_NAMES];
      expect(names1).toEqual(names2);
    });
  });

  describe('isValidToolName', () => {
    it('should return true for INIT', () => {
      expect(isValidToolName('taskpilot_init')).toBe(true);
    });

    it('should return true for START', () => {
      expect(isValidToolName('taskpilot_start')).toBe(true);
    });

    it('should return true for ADD', () => {
      expect(isValidToolName('taskpilot_add')).toBe(true);
    });

    it('should return true for STATUS', () => {
      expect(isValidToolName('taskpilot_status')).toBe(true);
    });

    it('should return true for UPDATE', () => {
      expect(isValidToolName('taskpilot_update')).toBe(true);
    });

    it('should return true for AUDIT', () => {
      expect(isValidToolName('taskpilot_audit')).toBe(true);
    });

    it('should return true for FOCUS', () => {
      expect(isValidToolName('taskpilot_focus')).toBe(true);
    });

    it('should return true for GITHUB', () => {
      expect(isValidToolName('taskpilot_github')).toBe(true);
    });

    it('should return true for RULE_UPDATE', () => {
      expect(isValidToolName('taskpilot_rule_update')).toBe(true);
    });

    it('should return true for REMOTE_INTERFACE', () => {
      expect(isValidToolName('taskpilot_remote_interface')).toBe(true);
    });

    it('should return true for UPDATE_RESOURCES', () => {
      expect(isValidToolName('taskpilot_update_resources')).toBe(true);
    });

    it('should return true for UPDATE_STEPS', () => {
      expect(isValidToolName('taskpilot_update_steps')).toBe(true);
    });

    it('should return false for invalid tool name', () => {
      expect(isValidToolName('invalid_tool')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidToolName('')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidToolName(undefined as any)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidToolName(null as any)).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isValidToolName('TASKPILOT_INIT')).toBe(false);
      expect(isValidToolName('TaskPilot_Init')).toBe(false);
    });

    it('should not accept partial matches', () => {
      expect(isValidToolName('taskpilot')).toBe(false);
      expect(isValidToolName('init')).toBe(false);
      expect(isValidToolName('taskpilot_')).toBe(false);
    });

    it('should not accept similar but incorrect names', () => {
      expect(isValidToolName('taskpilot_initializer')).toBe(false);
      expect(isValidToolName('taskpilot-init')).toBe(false); // hyphen instead of underscore
    });

    it('should work with enum values directly', () => {
      for (const toolName of Object.values(ToolNames)) {
        expect(isValidToolName(toolName)).toBe(true);
      }
    });
  });

  describe('validateToolName', () => {
    it('should not throw for valid tool names', () => {
      expect(() => validateToolName('taskpilot_init')).not.toThrow();
      expect(() => validateToolName('taskpilot_start')).not.toThrow();
      expect(() => validateToolName('taskpilot_add')).not.toThrow();
    });

    it('should throw for invalid tool name', () => {
      expect(() => validateToolName('invalid_tool')).toThrow();
    });

    it('should include tool name in error message', () => {
      expect(() => validateToolName('bad_tool')).toThrow(/bad_tool/);
    });

    it('should include "Unknown tool" in error message', () => {
      expect(() => validateToolName('unknown')).toThrow(/Unknown tool/);
    });

    it('should list available tools in error message', () => {
      try {
        validateToolName('invalid');
      } catch (error: any) {
        expect(error.message).toContain('taskpilot_init');
        expect(error.message).toContain('taskpilot_start');
        expect(error.message).toContain('taskpilot_add');
      }
    });

    it('should throw for empty string', () => {
      expect(() => validateToolName('')).toThrow();
    });

    it('should throw for whitespace string', () => {
      expect(() => validateToolName('   ')).toThrow();
    });

    it('should not throw for all enum values', () => {
      for (const toolName of Object.values(ToolNames)) {
        expect(() => validateToolName(toolName)).not.toThrow();
      }
    });

    it('should throw Error type', () => {
      try {
        validateToolName('invalid');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Type Safety', () => {
    it('should allow using enum as object keys', () => {
      const toolConfig: Record<ToolNames, any> = {
        [ToolNames.INIT]: { priority: 1 },
        [ToolNames.START]: { priority: 2 },
        [ToolNames.ADD]: { priority: 3 },
        [ToolNames.STATUS]: { priority: 4 },
        [ToolNames.UPDATE]: { priority: 5 },
        [ToolNames.AUDIT]: { priority: 6 },
        [ToolNames.FOCUS]: { priority: 7 },
        [ToolNames.GITHUB]: { priority: 8 },
        [ToolNames.RULE_UPDATE]: { priority: 9 },
        [ToolNames.REMOTE_INTERFACE]: { priority: 10 },
        [ToolNames.UPDATE_RESOURCES]: { priority: 11 },
        [ToolNames.UPDATE_STEPS]: { priority: 12 }
      };
      
      expect(toolConfig[ToolNames.INIT].priority).toBe(1);
    });

    it('should allow enum in switch statements', () => {
      const tool = ToolNames.INIT as ToolNames;
      let result: string = 'other';
      
      switch (tool) {
        case ToolNames.INIT:
          result = 'init';
          break;
        case ToolNames.START:
          result = 'start';
          break;
        case ToolNames.ADD:
          result = 'add';
          break;
        default:
          result = 'other';
      }
      
      expect(result).toBe('init');
    });

    it('should work with array includes', () => {
      const myTools = [ToolNames.INIT, ToolNames.ADD];
      expect(myTools.includes(ToolNames.INIT)).toBe(true);
      expect(myTools.includes(ToolNames.STATUS)).toBe(false);
    });
  });

  describe('Integration Scenarios', () => {
    it('should validate CLI input', () => {
      const userInput = 'taskpilot_init';
      if (isValidToolName(userInput)) {
        expect(TOOL_NAMES).toContain(userInput);
      }
    });

    it('should work in configuration objects', () => {
      const config = {
        allowedTools: [ToolNames.INIT, ToolNames.START, ToolNames.ADD],
        validateTool: (name: string) => isValidToolName(name)
      };
      
      expect(config.validateTool('taskpilot_init')).toBe(true);
      expect(config.validateTool('invalid')).toBe(false);
    });

    it('should support tool filtering by pattern', () => {
      const updateTools = TOOL_NAMES.filter(name => 
        name.includes('update')
      );
      
      expect(updateTools).toContain(ToolNames.UPDATE);
      expect(updateTools).toContain(ToolNames.RULE_UPDATE);
      expect(updateTools).toContain(ToolNames.UPDATE_RESOURCES);
      expect(updateTools).toContain(ToolNames.UPDATE_STEPS);
      expect(updateTools.length).toBe(4);
    });

    it('should support tool categorization', () => {
      const categories = {
        core: [ToolNames.INIT, ToolNames.START, ToolNames.STATUS],
        tasks: [ToolNames.ADD, ToolNames.UPDATE, ToolNames.FOCUS],
        analysis: [ToolNames.AUDIT],
        integration: [ToolNames.GITHUB, ToolNames.REMOTE_INTERFACE],
        configuration: [ToolNames.RULE_UPDATE, ToolNames.UPDATE_RESOURCES, ToolNames.UPDATE_STEPS]
      };
      
      const allCategorized = Object.values(categories).flat();
      expect(allCategorized).toHaveLength(TOOL_NAMES.length);
    });
  });

  describe('Edge Cases', () => {
    it('should handle tool name with extra whitespace', () => {
      expect(isValidToolName(' taskpilot_init ')).toBe(false);
    });

    it('should handle tool name with newlines', () => {
      expect(isValidToolName('taskpilot_init\n')).toBe(false);
    });

    it('should handle unicode lookalikes', () => {
      // Unicode underscore lookalike
      expect(isValidToolName('taskpilot＿init')).toBe(false);
    });

    it('should not accept numbers as tool names', () => {
      expect(isValidToolName('123' as any)).toBe(false);
    });

    it('should not accept objects as tool names', () => {
      expect(isValidToolName({} as any)).toBe(false);
      expect(isValidToolName([] as any)).toBe(false);
    });
  });
});
