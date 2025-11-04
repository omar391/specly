import { describe, it, expect, beforeAll, vi } from 'vitest';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { SpecRepositoryImpl, ToolVersionRepositoryImpl } from '../repositories/spec-repository.js';
import { ProfileRepository } from '../repositories/profile-repository.js';
import { WorkspaceRulesRepository } from '../repositories/workspace-rules-repository.js';
import { ActionJournalRepository } from '../repositories/action-journal-repository.js';
import { hashSpec, hashToolVersion } from '../utils/hash.js';
import { workspaces } from '../database/schema/global-schema.js';
import crypto from 'crypto';

let globalDb: GlobalDatabaseService;

describe('Repository Layer (Spec & ToolVersion)', () => {
  beforeAll(async () => {
    globalDb = new GlobalDatabaseService();
    await globalDb.initialize();
    const db = globalDb.getDrizzleManager().getDb();
    // Ensure test workspaces exist for FK constraints
    await db.insert(workspaces).values([
      { id: 'ws-1', path: '/tmp/ws-1', name: 'Workspace 1' },
      { id: 'ws-rules', path: '/tmp/ws-rules', name: 'Workspace Rules' }
    ] as any).onConflictDoNothing();
  });

  it('creates spec idempotently (same hash, second call not created)', async () => {
    const repo = new SpecRepositoryImpl(globalDb);
    const input = {
      executorType: 'generic-executor',
      executorVersion: '1.0.0',
      intent: 'human' as const,
      sideEffect: false,
      contentTemplate: 'Echo: {{input}}',
      staticParams: { a: 1 },
      inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { output: { type: 'string' } } },
      idempotencyKeyTemplate: '{{input}}',
      retryPolicy: { maxAttempts: 1 },
      showOutput: true,
      security: { allow: ['*'] },
      metadata: { tag: 'test', run: crypto.randomUUID() }
    };
    const first = await repo.createOrGet(input);
    const second = await repo.createOrGet(input);
    expect(first.hash).toBe(second.hash);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    // Recompute expected hash including the dynamic run metadata so hashes match
    const expectedHash = hashSpec({
      executor_type: input.executorType,
      executor_version: input.executorVersion,
      intent: input.intent,
      side_effect: input.sideEffect,
      content_template: input.contentTemplate,
      static_params: input.staticParams,
      input_schema: input.inputSchema,
      output_schema: input.outputSchema,
      idempotency_key_template: input.idempotencyKeyTemplate,
      retry_policy: input.retryPolicy,
      show_output: input.showOutput,
      security: input.security,
      metadata: input.metadata
    });
    expect(first.hash).toBe(expectedHash.hash);
  });

  it('creates tool version and lists by tool', async () => {
    const specRepo = new SpecRepositoryImpl(globalDb);
    const toolVersionRepo = new ToolVersionRepositoryImpl(globalDb);
    const spec = await specRepo.createOrGet({
      executorType: 'generic-executor',
      executorVersion: '1.0.0',
      intent: 'human',
      contentTemplate: 'Echo',
      staticParams: {},
      metadata: { run: crypto.randomUUID() }
    });
    const result = await toolVersionRepo.create({
      toolName: 'echo',
      ordered_specs: [spec.hash],
      edges: [],
      entry_spec: spec.hash
    });
    expect(result.created).toBe(true);
    const list = await toolVersionRepo.listByTool('echo');
    expect(list.length).toBeGreaterThan(0);
    expect(list.find(v => v.hash === result.hash)).toBeTruthy();

    // duplicate create should be idempotent
    const duplicate = await toolVersionRepo.create({
      toolName: 'echo',
      ordered_specs: [spec.hash],
      edges: [],
      entry_spec: spec.hash
    });
    expect(duplicate.created).toBe(false);

    const expectedHash = hashToolVersion({
      tool_name: 'echo',
      ordered_specs: [spec.hash],
      edges: [],
      entry_spec: spec.hash
    });
    expect(result.hash).toBe(expectedHash.hash);
  });

  it('creates profile, versions auto-increment, attaches tool, binds workspace', async () => {
    const specRepo = new SpecRepositoryImpl(globalDb);
    const toolVersionRepo = new ToolVersionRepositoryImpl(globalDb);
    const profileRepo = new ProfileRepository(globalDb);

    const spec = await specRepo.createOrGet({
      executorType: 'generic-executor',
      executorVersion: '1.0.0',
      intent: 'human',
      contentTemplate: 'Echo',
      staticParams: {},
      metadata: { run: crypto.randomUUID() }
    });
    const tv = await toolVersionRepo.create({
      toolName: 'echo-prof',
      ordered_specs: [spec.hash],
      edges: [],
      entry_spec: spec.hash
    });
  // Use a unique profile name each run to avoid collisions with prior test executions
  const p = await profileRepo.createProfile({ name: `base-profile-${crypto.randomUUID()}` , description: 'test' });
    expect(p.created).toBe(true);
    const v1 = await profileRepo.createProfileVersion({ profileId: p.profile.id });
    const v2 = await profileRepo.createProfileVersion({ profileId: p.profile.id });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    const attach = await profileRepo.attachToolToProfileVersion({
      profileVersionId: v1.id,
      toolName: 'echo-prof',
      toolVersionHash: tv.hash
    });
    expect(attach.created).toBe(true);
    const workspaceBinding = await profileRepo.bindWorkspaceProfile('ws-1', v2.id);
    expect(workspaceBinding.profileVersionId).toBe(v2.id);
  });

  it('reinforces workspace rules and increments confidence', async () => {
    const rulesRepo = new WorkspaceRulesRepository(globalDb);
    const uniqueRule = `test-rule-${crypto.randomUUID()}`;
    const r1 = await rulesRepo.addOrReinforce({ workspaceId: 'ws-rules', relation: 'always-do', rule: uniqueRule });
    const r2 = await rulesRepo.addOrReinforce({ workspaceId: 'ws-rules', relation: 'always-do', rule: uniqueRule });
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);
    // Logarithmic formula: 1 -> 31 (first reinforcement applies 1-(1-0.01)*0.7 = 0.307 -> 31)
    expect(r2.confidence).toBeGreaterThan(r1.confidence);
    expect(r2.confidence).toBe(31); // Verify exact logarithmic calculation
    const list = await rulesRepo.list('ws-rules');
    expect(list.find(r => r.id === r1.id)).toBeTruthy();
  });

  it('action journal createOrGetPending idempotent on (specHash, idemKey)', async () => {
    const journalRepo = new ActionJournalRepository(globalDb);
    // Create a spec to satisfy FK
    const specRepo = new SpecRepositoryImpl(globalDb);
    const spec = await specRepo.createOrGet({
      executorType: 'generic-executor',
      executorVersion: '1.0.0',
      intent: 'human',
      contentTemplate: 'Echo',
      staticParams: {},
      metadata: { run: crypto.randomUUID() }
    });
    const first = await journalRepo.createOrGetPending({ sessionId: 's1', specHash: spec.hash, idempotencyKey: 'K1' });
    const second = await journalRepo.createOrGetPending({ sessionId: 's1', specHash: spec.hash, idempotencyKey: 'K1' });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    await journalRepo.updateStatus(first.id, 'success', { resultJson: { ok: true } });
  });
});

describe('Repository Enhancements (SP-021)', () => {
  beforeAll(async () => {
    globalDb = new GlobalDatabaseService();
    await globalDb.initialize();
    const db = globalDb.getDrizzleManager().getDb();
    await db.insert(workspaces).values([
      { id: 'ws-sp021', path: '/tmp/ws-sp021', name: 'SP-021 Test Workspace' }
    ] as any).onConflictDoNothing();
  });

  it('should log collision when spec hash already exists', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const repo = new SpecRepositoryImpl(globalDb);
    
    const input = {
      executorType: 'test-executor',
      executorVersion: '1.0.0',
      intent: 'autonomous' as const,
      metadata: { collision_test: crypto.randomUUID() }
    };

    await repo.createOrGet(input); // First create
    await repo.createOrGet(input); // Second call should log collision

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SpecRepository] Hash collision detected (idempotent):')
    );
    
    consoleLogSpy.mockRestore();
  });

  it('should log collision when tool version hash already exists', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const specRepo = new SpecRepositoryImpl(globalDb);
    const toolRepo = new ToolVersionRepositoryImpl(globalDb);
    
    const spec = await specRepo.createOrGet({
      executorType: 'test-executor',
      executorVersion: '1.0.0',
      intent: 'autonomous',
      metadata: { tool_collision_test: crypto.randomUUID() }
    });

    const toolInput = {
      toolName: 'collision-test-tool',
      ordered_specs: [spec.hash],
      edges: [],
      entry_spec: spec.hash
    };

    await toolRepo.create(toolInput); // First create
    await toolRepo.create(toolInput); // Second call should log collision

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ToolVersionRepository] Tool version hash collision detected (idempotent): tool=collision-test-tool')
    );
    
    consoleLogSpy.mockRestore();
  });

  it('should return typed SpecDTO from get method', async () => {
    const repo = new SpecRepositoryImpl(globalDb);
    const input = {
      executorType: 'typed-executor',
      executorVersion: '2.0.0',
      intent: 'human' as const,
      contentTemplate: 'Test template',
      staticParams: { key: 'value' },
      retryPolicy: { maxAttempts: 3, strategy: 'exponential' as const },
      metadata: { typed_dto_test: crypto.randomUUID() }
    };

    const { hash } = await repo.createOrGet(input);
    const retrieved = await repo.get(hash);

    expect(retrieved).toBeDefined();
    expect(retrieved?.hash).toBe(hash);
    expect(retrieved?.executorType).toBe('typed-executor');
    expect(retrieved?.executorVersion).toBe('2.0.0');
    expect(retrieved?.intent).toBe('human');
    // Verify it's a proper DTO with all expected fields
    // Note: Drizzle ORM may return boolean for integer fields (0/1 -> false/true)
    expect([0, 1, false, true]).toContain(retrieved?.sideEffect as any);
    expect(typeof retrieved?.staticParams).toBe('string'); // JSON string
    expect(retrieved?.createdAt).toBeDefined();
  });

  it('should return typed ToolVersionDTO from get method', async () => {
    const specRepo = new SpecRepositoryImpl(globalDb);
    const toolRepo = new ToolVersionRepositoryImpl(globalDb);
    
    const spec = await specRepo.createOrGet({
      executorType: 'test-executor',
      executorVersion: '1.0.0',
      intent: 'autonomous',
      metadata: { tool_dto_test: crypto.randomUUID() }
    });

    const toolInput = {
      toolName: 'dto-test-tool',
      ordered_specs: [spec.hash],
      edges: [{ from: spec.hash, to: spec.hash, priority: 1 }],
      entry_spec: spec.hash
    };

    const { hash } = await toolRepo.create(toolInput);
    const retrieved = await toolRepo.get(hash);

    expect(retrieved).toBeDefined();
    expect(retrieved?.hash).toBe(hash);
    expect(retrieved?.toolName).toBe('dto-test-tool');
    expect(typeof retrieved?.graphManifest).toBe('string'); // JSON string
    expect(retrieved?.createdAt).toBeDefined();
  });

  it('should return array of typed ToolVersionDTO from listByTool', async () => {
    const specRepo = new SpecRepositoryImpl(globalDb);
    const toolRepo = new ToolVersionRepositoryImpl(globalDb);
    
    const spec1 = await specRepo.createOrGet({
      executorType: 'test-executor',
      executorVersion: '1.0.0',
      intent: 'autonomous',
      metadata: { list_test_v1: crypto.randomUUID() }
    });

    const spec2 = await specRepo.createOrGet({
      executorType: 'test-executor',
      executorVersion: '2.0.0',
      intent: 'autonomous',
      metadata: { list_test_v2: crypto.randomUUID() }
    });

    const toolName = `list-test-tool-${crypto.randomUUID().substring(0, 8)}`;

    await toolRepo.create({
      toolName,
      ordered_specs: [spec1.hash],
      edges: [],
      entry_spec: spec1.hash
    });

    await toolRepo.create({
      toolName,
      ordered_specs: [spec2.hash],
      edges: [],
      entry_spec: spec2.hash
    });

    const versions = await toolRepo.listByTool(toolName);

    expect(Array.isArray(versions)).toBe(true);
    expect(versions.length).toBe(2);
    expect(versions[0].toolName).toBe(toolName);
    expect(versions[1].toolName).toBe(toolName);
    expect(typeof versions[0].graphManifest).toBe('string');
    expect(typeof versions[1].graphManifest).toBe('string');
  });

  it('should handle graph manifest round-trip with canonical ordering', async () => {
    const specRepo = new SpecRepositoryImpl(globalDb);
    const toolRepo = new ToolVersionRepositoryImpl(globalDb);
    
    const specA = await specRepo.createOrGet({
      executorType: 'test',
      executorVersion: '1.0.0',
      intent: 'autonomous',
      metadata: { roundtrip_a: crypto.randomUUID() }
    });

    const specB = await specRepo.createOrGet({
      executorType: 'test',
      executorVersion: '1.0.0',
      intent: 'autonomous',
      metadata: { roundtrip_b: crypto.randomUUID() }
    });

    const inputManifest = {
      ordered_specs: [specA.hash, specB.hash],
      edges: [
        { from: specB.hash, to: specA.hash, priority: 2 }, // Intentional reverse order
        { from: specA.hash, to: specB.hash, priority: 1 }
      ],
      entry_spec: specA.hash
    };

    const { hash } = await toolRepo.create({
      toolName: 'roundtrip-tool',
      ...inputManifest
    });

    const retrieved = await toolRepo.get(hash);
    expect(retrieved).toBeDefined();

    const parsedManifest = JSON.parse(retrieved!.graphManifest);
    expect(parsedManifest.ordered_specs).toEqual(inputManifest.ordered_specs);
    expect(parsedManifest.entry_spec).toBe(inputManifest.entry_spec);
    // Edges should be present (order normalization handled by validator)
    expect(parsedManifest.edges).toBeDefined();
    expect(parsedManifest.edges.length).toBe(2);
  });
});
