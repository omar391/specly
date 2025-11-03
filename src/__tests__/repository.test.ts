import { describe, it, expect, beforeAll } from 'vitest';
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
      retryPolicy: { max: 1 },
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
