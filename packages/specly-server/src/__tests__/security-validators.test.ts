/**
 * Tests for Security Validators (SP-013)
 * 
 * Tests security validation, size limits, executor types, and graph constraints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateExecutorType,
  validateSpecSizeLimits,
  validateGraphSizeLimits,
  computeGraphDepth,
  validateGraphDepth,
  validateCommandAliasUniqueness,
  validateSpecSecurity,
  SECURITY_LIMITS,
  type SecurityValidationError
} from '../utils/security-validators.js';
import type { GlobalDatabaseService } from '../database/global-queries.js';

describe('Security Validators', () => {
  describe('validateExecutorType', () => {
    it('should accept function executor type', () => {
      const result = validateExecutorType('function');
      expect(result).toBeNull();
    });

    it('should accept bash executor type', () => {
      const result = validateExecutorType('bash');
      expect(result).toBeNull();
    });

    it('should accept rest executor type', () => {
      const result = validateExecutorType('rest');
      expect(result).toBeNull();
    });

    it('should accept graphql executor type', () => {
      const result = validateExecutorType('graphql');
      expect(result).toBeNull();
    });

    it('should accept noop executor type', () => {
      const result = validateExecutorType('noop');
      expect(result).toBeNull();
    });

    it('should accept node executor type', () => {
      const result = validateExecutorType('node');
      expect(result).toBeNull();
    });

    it('should reject invalid executor type', () => {
      const result = validateExecutorType('invalid_type');
      expect(result).not.toBeNull();
      expect(result!.code).toBe('ERR_INVALID_EXECUTOR_TYPE');
      expect(result!.message).toContain('invalid_type');
      expect(result!.message).toContain('not allowed');
    });

    it('should include allowed types in error message', () => {
      const result = validateExecutorType('python');
      expect(result!.message).toContain('function');
      expect(result!.message).toContain('bash');
      expect(result!.message).toContain('rest');
    });

    it('should include error details', () => {
      const result = validateExecutorType('invalid');
      expect(result!.details).toBeDefined();
      expect(result!.details.executorType).toBe('invalid');
      expect(result!.details.allowed).toContain('function');
    });

    it('should be case-sensitive', () => {
      const result = validateExecutorType('FUNCTION');
      expect(result).not.toBeNull();
    });

    it('should reject empty string', () => {
      const result = validateExecutorType('');
      expect(result).not.toBeNull();
    });
  });

  describe('validateSpecSizeLimits', () => {
    it('should accept spec within size limits', () => {
      const spec = {
        content_template: 'Small content',
        input_schema: { type: 'object' },
        output_schema: { type: 'object' }
      };
      const result = validateSpecSizeLimits(spec);
      expect(result).toBeNull();
    });

    it('should reject content_template exceeding limit', () => {
      const largeContent = 'x'.repeat(SECURITY_LIMITS.MAX_SPEC_CONTENT_SIZE + 1);
      const spec = { content_template: largeContent };
      const result = validateSpecSizeLimits(spec);
      
      expect(result).not.toBeNull();
      expect(result!.code).toBe('ERR_SPEC_CONTENT_TOO_LARGE');
      expect(result!.details.contentSize).toBeGreaterThan(SECURITY_LIMITS.MAX_SPEC_CONTENT_SIZE);
    });

    it('should accept content_template at exact limit', () => {
      const exactContent = 'x'.repeat(SECURITY_LIMITS.MAX_SPEC_CONTENT_SIZE);
      const spec = { content_template: exactContent };
      const result = validateSpecSizeLimits(spec);
      expect(result).toBeNull();
    });

    it('should reject input_schema exceeding limit', () => {
      // Create a schema just over 100KB by using a large string
      const largeSchema = {
        description: 'x'.repeat(SECURITY_LIMITS.MAX_INPUT_SCHEMA_SIZE + 1000)
      };
      const spec = { input_schema: largeSchema };
      const result = validateSpecSizeLimits(spec);
      
      expect(result).not.toBeNull();
      expect(result!.code).toBe('ERR_INPUT_SCHEMA_TOO_LARGE');
    });

    it('should reject output_schema exceeding limit', () => {
      // Create a schema just over 100KB by using a large string
      const largeSchema = {
        description: 'x'.repeat(SECURITY_LIMITS.MAX_OUTPUT_SCHEMA_SIZE + 1000)
      };
      const spec = { output_schema: largeSchema };
      const result = validateSpecSizeLimits(spec);
      
      expect(result).not.toBeNull();
      expect(result!.code).toBe('ERR_OUTPUT_SCHEMA_TOO_LARGE');
    });

    it('should handle null content_template', () => {
      const spec = { content_template: null };
      const result = validateSpecSizeLimits(spec);
      expect(result).toBeNull();
    });

    it('should handle undefined schemas', () => {
      const spec = {
        content_template: 'test',
        input_schema: undefined,
        output_schema: undefined
      };
      const result = validateSpecSizeLimits(spec);
      expect(result).toBeNull();
    });

    it('should handle empty spec', () => {
      const spec = {};
      const result = validateSpecSizeLimits(spec);
      expect(result).toBeNull();
    });

    it('should correctly calculate UTF-8 byte size', () => {
      // Each emoji is 4 bytes in UTF-8, so need >250K emojis to exceed 1MB
      const unicodeContent = '🚀'.repeat(300000); // 300K * 4 bytes = 1.2MB
      const spec = { content_template: unicodeContent };
      const result = validateSpecSizeLimits(spec);
      
      // Should reject because >1MB
      expect(result).not.toBeNull();
      expect(result!.code).toBe('ERR_SPEC_CONTENT_TOO_LARGE');
    });
  });

  describe('validateGraphSizeLimits', () => {
    it('should accept graph within size limits', () => {
      const manifest = {
        ordered_specs: ['spec1', 'spec2', 'spec3'],
        edges: [{ from: 'spec1', to: 'spec2' }]
      };
      const result = validateGraphSizeLimits(manifest);
      expect(result).toBeNull();
    });

    it('should reject graph exceeding node limit', () => {
      const tooManySpecs = Array(SECURITY_LIMITS.MAX_GRAPH_NODES + 1)
        .fill(0)
        .map((_, i) => `spec${i}`);
      const manifest = {
        ordered_specs: tooManySpecs,
        edges: []
      };
      const result = validateGraphSizeLimits(manifest);
      
      expect(result).not.toBeNull();
      expect(result!.code).toBe('ERR_GRAPH_TOO_MANY_NODES');
      expect(result!.details.nodeCount).toBeGreaterThan(SECURITY_LIMITS.MAX_GRAPH_NODES);
    });

    it('should accept graph at exact node limit', () => {
      const exactSpecs = Array(SECURITY_LIMITS.MAX_GRAPH_NODES)
        .fill(0)
        .map((_, i) => `spec${i}`);
      const manifest = {
        ordered_specs: exactSpecs,
        edges: []
      };
      const result = validateGraphSizeLimits(manifest);
      expect(result).toBeNull();
    });

    it('should reject graph with too many edges', () => {
      const specs = Array(100).fill(0).map((_, i) => `spec${i}`);
      const tooManyEdges = Array(SECURITY_LIMITS.MAX_GRAPH_NODES * 3 + 1)
        .fill(0)
        .map((_, i) => ({ from: `spec${i % 100}`, to: `spec${(i + 1) % 100}` }));
      const manifest = {
        ordered_specs: specs,
        edges: tooManyEdges
      };
      const result = validateGraphSizeLimits(manifest);
      
      expect(result).not.toBeNull();
      expect(result!.code).toBe('ERR_GRAPH_TOO_MANY_EDGES');
    });

    it('should handle empty graph', () => {
      const manifest = {
        ordered_specs: [],
        edges: []
      };
      const result = validateGraphSizeLimits(manifest);
      expect(result).toBeNull();
    });

    it('should handle single node graph', () => {
      const manifest = {
        ordered_specs: ['single'],
        edges: []
      };
      const result = validateGraphSizeLimits(manifest);
      expect(result).toBeNull();
    });
  });

  describe('computeGraphDepth', () => {
    it('should return 0 for single node graph', () => {
      const manifest = {
        ordered_specs: ['entry'],
        entry_spec: 'entry',
        edges: []
      };
      const depth = computeGraphDepth(manifest);
      expect(depth).toBe(0);
    });

    it('should compute depth for linear chain', () => {
      const manifest = {
        ordered_specs: ['a', 'b', 'c', 'd'],
        entry_spec: 'a',
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
          { from: 'c', to: 'd' }
        ]
      };
      const depth = computeGraphDepth(manifest);
      expect(depth).toBe(3);
    });

    it('should compute depth for branching graph', () => {
      const manifest = {
        ordered_specs: ['start', 'left', 'right', 'end'],
        entry_spec: 'start',
        edges: [
          { from: 'start', to: 'left' },
          { from: 'start', to: 'right' },
          { from: 'left', to: 'end' },
          { from: 'right', to: 'end' }
        ]
      };
      const depth = computeGraphDepth(manifest);
      expect(depth).toBe(2);
    });

    it('should handle disconnected nodes', () => {
      const manifest = {
        ordered_specs: ['entry', 'connected', 'disconnected'],
        entry_spec: 'entry',
        edges: [
          { from: 'entry', to: 'connected' }
        ]
      };
      const depth = computeGraphDepth(manifest);
      expect(depth).toBe(1);
    });

    it('should handle cycles gracefully', () => {
      const manifest = {
        ordered_specs: ['a', 'b', 'c'],
        entry_spec: 'a',
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
          { from: 'c', to: 'a' }
        ]
      };
      const depth = computeGraphDepth(manifest);
      expect(depth).toBeGreaterThanOrEqual(0);
    });

    it('should compute depth for diamond pattern', () => {
      const manifest = {
        ordered_specs: ['start', 'mid1', 'mid2', 'end'],
        entry_spec: 'start',
        edges: [
          { from: 'start', to: 'mid1' },
          { from: 'start', to: 'mid2' },
          { from: 'mid1', to: 'end' },
          { from: 'mid2', to: 'end' }
        ]
      };
      const depth = computeGraphDepth(manifest);
      expect(depth).toBe(2);
    });

    it('should handle deep linear chain', () => {
      const specs = Array(100).fill(0).map((_, i) => `spec${i}`);
      const edges = Array(99).fill(0).map((_, i) => ({ from: `spec${i}`, to: `spec${i + 1}` }));
      const manifest = {
        ordered_specs: specs,
        entry_spec: 'spec0',
        edges
      };
      const depth = computeGraphDepth(manifest);
      expect(depth).toBe(99);
    });
  });

  describe('validateGraphDepth', () => {
    it('should accept graph within depth limit', () => {
      const manifest = {
        ordered_specs: ['a', 'b', 'c'],
        entry_spec: 'a',
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' }
        ]
      };
      const result = validateGraphDepth(manifest);
      expect(result).toBeNull();
    });

    it('should reject graph exceeding depth limit', () => {
      const specs = Array(SECURITY_LIMITS.MAX_SPEC_GRAPH_DEPTH + 2)
        .fill(0)
        .map((_, i) => `spec${i}`);
      const edges = Array(SECURITY_LIMITS.MAX_SPEC_GRAPH_DEPTH + 1)
        .fill(0)
        .map((_, i) => ({ from: `spec${i}`, to: `spec${i + 1}` }));
      const manifest = {
        ordered_specs: specs,
        entry_spec: 'spec0',
        edges
      };
      const result = validateGraphDepth(manifest);
      
      expect(result).not.toBeNull();
      expect(result!.code).toBe('ERR_GRAPH_TOO_DEEP');
      expect(result!.details.depth).toBeGreaterThan(SECURITY_LIMITS.MAX_SPEC_GRAPH_DEPTH);
    });

    it('should accept graph at exact depth limit', () => {
      const specs = Array(SECURITY_LIMITS.MAX_SPEC_GRAPH_DEPTH + 1)
        .fill(0)
        .map((_, i) => `spec${i}`);
      const edges = Array(SECURITY_LIMITS.MAX_SPEC_GRAPH_DEPTH)
        .fill(0)
        .map((_, i) => ({ from: `spec${i}`, to: `spec${i + 1}` }));
      const manifest = {
        ordered_specs: specs,
        entry_spec: 'spec0',
        edges
      };
      const result = validateGraphDepth(manifest);
      expect(result).toBeNull();
    });
  });

  describe('validateCommandAliasUniqueness', () => {
    let mockDbService: GlobalDatabaseService;
    let mockDb: any;

    beforeEach(() => {
      mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([])
      };

      mockDbService = {
        initialize: vi.fn().mockResolvedValue(undefined),
        getDrizzleManager: vi.fn().mockReturnValue({
          getDb: vi.fn().mockReturnValue(mockDb)
        })
      } as any;
    });

    it('should return null when command_alias is null', async () => {
      const result = await validateCommandAliasUniqueness(mockDbService, null);
      expect(result).toBeNull();
      expect(mockDbService.initialize).not.toHaveBeenCalled();
    });

    it('should return null when command_alias is undefined', async () => {
      const result = await validateCommandAliasUniqueness(mockDbService, undefined);
      expect(result).toBeNull();
    });

    it('should return null when no conflict exists', async () => {
      mockDb.limit.mockResolvedValue([]);
      
      const result = await validateCommandAliasUniqueness(mockDbService, 'unique_alias');
      expect(result).toBeNull();
      expect(mockDbService.initialize).toHaveBeenCalled();
    });

    it('should return error when alias conflicts', async () => {
      mockDb.limit.mockResolvedValue([{ name: 'existing_tool' }]);
      
      const result = await validateCommandAliasUniqueness(mockDbService, 'duplicate_alias');
      expect(result).not.toBeNull();
      expect(result!.code).toBe('ERR_COMMAND_ALIAS_CONFLICT');
      expect(result!.message).toContain('duplicate_alias');
      expect(result!.message).toContain('existing_tool');
    });

    it('should allow same tool to keep same alias', async () => {
      mockDb.limit.mockResolvedValue([{ name: 'my_tool' }]);
      
      const result = await validateCommandAliasUniqueness(
        mockDbService,
        'my_alias',
        'my_tool'
      );
      expect(result).toBeNull();
    });

    it('should reject when different tool has alias', async () => {
      mockDb.limit.mockResolvedValue([{ name: 'other_tool' }]);
      
      const result = await validateCommandAliasUniqueness(
        mockDbService,
        'conflicting_alias',
        'my_tool'
      );
      expect(result).not.toBeNull();
      expect(result!.details.conflictingTool).toBe('other_tool');
    });

    it('should initialize database before query', async () => {
      await validateCommandAliasUniqueness(mockDbService, 'test_alias');
      expect(mockDbService.initialize).toHaveBeenCalledBefore(mockDb.select as any);
    });
  });

  describe('validateSpecSecurity', () => {
    it('should accept valid spec', () => {
      const spec = {
        executor_type: 'function',
        content_template: 'Small content',
        input_schema: { type: 'object' },
        output_schema: { type: 'object' }
      };
      const result = validateSpecSecurity(spec);
      expect(result).toBeNull();
    });

    it('should reject invalid executor type first', () => {
      const spec = {
        executor_type: 'invalid',
        content_template: 'x'.repeat(SECURITY_LIMITS.MAX_SPEC_CONTENT_SIZE + 1)
      };
      const result = validateSpecSecurity(spec);
      
      expect(result).not.toBeNull();
      expect(result!.code).toBe('ERR_INVALID_EXECUTOR_TYPE');
    });

    it('should check size limits after executor type', () => {
      const spec = {
        executor_type: 'function',
        content_template: 'x'.repeat(SECURITY_LIMITS.MAX_SPEC_CONTENT_SIZE + 1)
      };
      const result = validateSpecSecurity(spec);
      
      expect(result).not.toBeNull();
      expect(result!.code).toBe('ERR_SPEC_CONTENT_TOO_LARGE');
    });

    it('should accept minimal spec', () => {
      const spec = {
        executor_type: 'noop'
      };
      const result = validateSpecSecurity(spec);
      expect(result).toBeNull();
    });
  });

  describe('SECURITY_LIMITS', () => {
    it('should export MAX_SPEC_CONTENT_SIZE', () => {
      expect(SECURITY_LIMITS.MAX_SPEC_CONTENT_SIZE).toBeGreaterThan(0);
      expect(typeof SECURITY_LIMITS.MAX_SPEC_CONTENT_SIZE).toBe('number');
    });

    it('should export MAX_SPEC_GRAPH_DEPTH', () => {
      expect(SECURITY_LIMITS.MAX_SPEC_GRAPH_DEPTH).toBeGreaterThan(0);
      expect(typeof SECURITY_LIMITS.MAX_SPEC_GRAPH_DEPTH).toBe('number');
    });

    it('should export MAX_GRAPH_NODES', () => {
      expect(SECURITY_LIMITS.MAX_GRAPH_NODES).toBeGreaterThan(0);
      expect(typeof SECURITY_LIMITS.MAX_GRAPH_NODES).toBe('number');
    });

    it('should export MAX_INPUT_SCHEMA_SIZE', () => {
      expect(SECURITY_LIMITS.MAX_INPUT_SCHEMA_SIZE).toBeGreaterThan(0);
    });

    it('should export MAX_OUTPUT_SCHEMA_SIZE', () => {
      expect(SECURITY_LIMITS.MAX_OUTPUT_SCHEMA_SIZE).toBeGreaterThan(0);
    });

    it('should export ALLOWED_EXECUTOR_TYPES', () => {
      expect(Array.isArray(SECURITY_LIMITS.ALLOWED_EXECUTOR_TYPES)).toBe(true);
      expect(SECURITY_LIMITS.ALLOWED_EXECUTOR_TYPES.length).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.ALLOWED_EXECUTOR_TYPES).toContain('function');
    });

    it('should have reasonable default values', () => {
      expect(SECURITY_LIMITS.MAX_SPEC_CONTENT_SIZE).toBeGreaterThanOrEqual(1024 * 1024); // At least 1MB
      expect(SECURITY_LIMITS.MAX_SPEC_GRAPH_DEPTH).toBeGreaterThanOrEqual(10);
      expect(SECURITY_LIMITS.MAX_GRAPH_NODES).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle very long spec names in graph', () => {
      const longName = 'spec_' + 'x'.repeat(1000);
      const manifest = {
        ordered_specs: [longName],
        entry_spec: longName,
        edges: []
      };
      const depth = computeGraphDepth(manifest);
      expect(depth).toBe(0);
    });

    it('should handle unicode in content templates', () => {
      const spec = {
        content_template: '你好世界 🌍 Здравствуй мир',
        input_schema: { type: 'object' }
      };
      const result = validateSpecSizeLimits(spec);
      expect(result).toBeNull();
    });

    it('should validate multiple violations in sequence', () => {
      // First violation should be returned
      const spec = {
        executor_type: 'invalid',
        content_template: 'x'.repeat(SECURITY_LIMITS.MAX_SPEC_CONTENT_SIZE + 1)
      };
      const result = validateSpecSecurity(spec);
      expect(result!.code).toBe('ERR_INVALID_EXECUTOR_TYPE');
    });

    it('should handle self-referencing edges in depth calculation', () => {
      const manifest = {
        ordered_specs: ['a', 'b'],
        entry_spec: 'a',
        edges: [
          { from: 'a', to: 'a' },
          { from: 'a', to: 'b' }
        ]
      };
      const depth = computeGraphDepth(manifest);
      expect(depth).toBeGreaterThanOrEqual(0);
    });
  });
});
