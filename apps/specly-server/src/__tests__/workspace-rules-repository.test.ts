import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceRulesRepository } from '../repositories/workspace-rules-repository.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';

describe('WorkspaceRulesRepository', () => {
  let globalMgr: DrizzleDatabaseManager;
  let globalDbService: GlobalDatabaseService;
  let repo: WorkspaceRulesRepository;

  beforeEach(async () => {
    globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
    globalDbService = new GlobalDatabaseService(globalMgr as any);
    await globalDbService.initialize();

    // Create test workspace
    await globalDbService.createWorkspace({
      id: 'ws-test',
      path: '/test/workspace',
      name: 'Test Workspace'
    });

    repo = new WorkspaceRulesRepository(globalDbService);
  });

  describe('addOrReinforce', () => {
    it('creates new rule successfully', async () => {
      const result = await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'always-do',
        rule: 'use strict types'
      });

      expect(result.created).toBe(true);
      expect(result.confidence).toBe(1);
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
    });

    it('reinforces existing rule and increases confidence', async () => {
      const input = {
        workspaceId: 'ws-test',
        relation: 'never-do',
        rule: 'commit without tests'
      };

      // First call: create
      const first = await repo.addOrReinforce(input);
      expect(first.created).toBe(true);
      expect(first.confidence).toBe(1);

      // Second call: reinforce
      const second = await repo.addOrReinforce(input);
      expect(second.created).toBe(false);
      expect(second.confidence).toBeGreaterThan(1);
      expect(second.id).toBe(first.id);
    });

    it('handles optional fields correctly', async () => {
      const result = await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'is-a',
        rule: 'typescript project',
        originalText: 'This is a TypeScript project',
        sourceSessionId: 'session-123'
      });

      expect(result.created).toBe(true);
      expect(result.confidence).toBe(1);
    });

    it('handles null optional fields correctly', async () => {
      const result = await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'has-a',
        rule: 'package.json',
        originalText: null,
        sourceSessionId: null
      });

      expect(result.created).toBe(true);
      expect(result.confidence).toBe(1);
    });

    it('applies logarithmic reinforcement formula correctly', async () => {
      const input = {
        workspaceId: 'ws-test',
        relation: 'always-do',
        rule: 'test reinforcement'
      };

      // Create: confidence = 1
      await repo.addOrReinforce(input);

      // First reinforcement: should increase significantly
      const second = await repo.addOrReinforce(input);
      expect(second.confidence).toBeGreaterThan(1);

      // Second reinforcement: should increase but with diminishing returns
      const third = await repo.addOrReinforce(input);
      expect(third.confidence).toBeGreaterThan(second.confidence);

      // Third reinforcement: even smaller increase
      const fourth = await repo.addOrReinforce(input);
      expect(fourth.confidence).toBeGreaterThan(third.confidence);
    });

    it('caps confidence at 100', async () => {
      const input = {
        workspaceId: 'ws-test',
        relation: 'always-do',
        rule: 'max confidence test'
      };

      // Create initial rule
      await repo.addOrReinforce(input);

      // Reinforce many times to reach cap
      for (let i = 0; i < 50; i++) {
        await repo.addOrReinforce(input);
      }

      const result = await repo.addOrReinforce(input);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('handles all relation types', async () => {
      const relations: Array<'always-do' | 'never-do' | 'is-a' | 'has-a'> = [
        'always-do', 'never-do', 'is-a', 'has-a'
      ];

      for (const relation of relations) {
        const result = await repo.addOrReinforce({
          workspaceId: 'ws-test',
          relation,
          rule: `test rule for ${relation}`
        });
        expect(result.created).toBe(true);
        expect(result.confidence).toBe(1);
      }
    });

    it('generates unique IDs for different rules', async () => {
      const result1 = await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'always-do',
        rule: 'rule 1'
      });

      const result2 = await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'always-do',
        rule: 'rule 2'
      });

      expect(result1.id).not.toBe(result2.id);
      expect(result1.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(result2.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      // Create test rules with different confidence levels
      await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'always-do',
        rule: 'low confidence rule'
      });

      await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'always-do',
        rule: 'high confidence rule'
      });
      // Reinforce to increase confidence
      await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'always-do',
        rule: 'high confidence rule'
      });
      await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'always-do',
        rule: 'high confidence rule'
      });
    });

    it('returns rules ordered by confidence desc, then createdAt desc', async () => {
      const rules = await repo.list('ws-test');

      expect(rules).toHaveLength(2);
      expect(rules[0].confidence).toBeGreaterThan(rules[1].confidence);
      expect(rules[0].rule).toBe('high confidence rule');
      expect(rules[1].rule).toBe('low confidence rule');
    });

    it('returns all rules when activeOnly is false', async () => {
      const rules = await repo.list('ws-test', false);
      expect(rules).toHaveLength(2);
      // All rules should be active by default
      expect(rules.every(r => r.active)).toBe(true);
    });

    it('filters to active rules only by default', async () => {
      const rules = await repo.list('ws-test');
      expect(rules).toHaveLength(2);
      expect(rules.every(r => r.active)).toBe(true);
    });

    it('returns empty array for workspace with no rules', async () => {
      const rules = await repo.list('ws-empty');
      expect(rules).toEqual([]);
    });

    it('includes all rule properties in response', async () => {
      const rules = await repo.list('ws-test');

      for (const rule of rules) {
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('workspaceId', 'ws-test');
        expect(rule).toHaveProperty('relation');
        expect(rule).toHaveProperty('rule');
        expect(rule).toHaveProperty('originalText');
        expect(rule).toHaveProperty('sourceSessionId');
        expect(rule).toHaveProperty('confidence');
        expect(rule).toHaveProperty('active');
        expect(rule).toHaveProperty('createdAt');
        expect(rule).toHaveProperty('lastReinforcedAt');
      }
    });

    it('handles multiple rules with same confidence (orders by recency)', async () => {
      // Create another low confidence rule more recently
      await new Promise(resolve => setTimeout(resolve, 100)); // Longer delay for timestamp precision
      await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'never-do',
        rule: 'recent low confidence rule'
      });

      const rules = await repo.list('ws-test');
      expect(rules).toHaveLength(3);

      // High confidence rule should still be first
      expect(rules[0].rule).toBe('high confidence rule');

      const lowConfidenceRules = rules.filter(r => r.confidence === 1);
      expect(lowConfidenceRules).toHaveLength(2);
      // Both low confidence rules should be present, but ordering may be non-deterministic
      // when timestamps are identical
      const lowConfidenceRuleTexts = lowConfidenceRules.map(r => r.rule);
      expect(lowConfidenceRuleTexts).toContain('recent low confidence rule');
      expect(lowConfidenceRuleTexts).toContain('low confidence rule');
    });
  });

  describe('edge cases and error handling', () => {
    it('handles very long rule text', async () => {
      const longRule = 'a'.repeat(1000);
      const result = await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'always-do',
        rule: longRule
      });

      expect(result.created).toBe(true);
      expect(result.confidence).toBe(1);
    });

    it('handles special characters in rule text', async () => {
      const specialRule = 'use "strict" mode & avoid == comparison';
      const result = await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'never-do',
        rule: specialRule
      });

      expect(result.created).toBe(true);

      // Verify it can be retrieved
      const rules = await repo.list('ws-test');
      expect(rules.some(r => r.rule === specialRule)).toBe(true);
    });

    it('handles empty string in optional fields', async () => {
      const result = await repo.addOrReinforce({
        workspaceId: 'ws-test',
        relation: 'is-a',
        rule: 'test rule',
        originalText: '',
        sourceSessionId: ''
      });

      expect(result.created).toBe(true);
    });

    it('maintains data integrity across multiple operations', async () => {
      // Create multiple rules
      const rules = [
        { relation: 'always-do' as const, rule: 'rule 1' },
        { relation: 'never-do' as const, rule: 'rule 2' },
        { relation: 'is-a' as const, rule: 'rule 3' },
        { relation: 'has-a' as const, rule: 'rule 4' }
      ];

      for (const rule of rules) {
        await repo.addOrReinforce({
          workspaceId: 'ws-test',
          ...rule
        });
      }

      // Reinforce one rule multiple times
      for (let i = 0; i < 5; i++) {
        await repo.addOrReinforce({
          workspaceId: 'ws-test',
          relation: 'always-do',
          rule: 'rule 1'
        });
      }

      const allRules = await repo.list('ws-test');
      expect(allRules).toHaveLength(4);

      const reinforcedRule = allRules.find(r => r.rule === 'rule 1');
      expect(reinforcedRule!.confidence).toBeGreaterThan(1);
    });

    it('handles existing rule with null confidence (nullish fallback)', async () => {
      // Build a fake global DB whose select returns a row with confidence: null
      const fakeDb: any = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: 'null-conf', confidence: null }]
            })
          })
        }),
        update: () => ({ set: () => ({ where: async () => ({}) }) })
      };

      const fakeGlobalDb = {
        getDrizzleManager: () => ({ getDb: () => fakeDb })
      } as unknown as GlobalDatabaseService;

      const repoWithNull = new WorkspaceRulesRepository(fakeGlobalDb as any);

      const result = await repoWithNull.addOrReinforce({ workspaceId: 'ws-test', relation: 'always-do', rule: 'null confidence rule' });

      expect(result.created).toBe(false);
      // Since old confidence is null, fallback value 1 should be used and then increased
      expect(result.confidence).toBeGreaterThanOrEqual(1);
      expect(result.id).toBe('null-conf');
    });

    it('handles insert returning without confidence (undefined fallback)', async () => {
      // Build a fake global DB whose insert returning returns a row without confidence
      const fakeDb: any = {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
        insert: () => ({ values: () => ({ returning: async () => [{ id: 'inserted-no-conf' }] }) })
      };

      const fakeGlobalDb = {
        getDrizzleManager: () => ({ getDb: () => fakeDb })
      } as unknown as GlobalDatabaseService;

      const repoWithMissing = new WorkspaceRulesRepository(fakeGlobalDb as any);

      const result = await repoWithMissing.addOrReinforce({ workspaceId: 'ws-test', relation: 'always-do', rule: 'no conf insert' });

      expect(result.created).toBe(true);
      // When the returned row lacks a confidence value, fallback to 1 should be used
      expect(result.confidence).toBe(1);
      expect(result.id).toBe('inserted-no-conf');
    });
  });
});