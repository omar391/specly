import { describe, it, expect, beforeAll } from 'vitest';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { SpecRepositoryImpl, ToolVersionRepositoryImpl } from '../repositories/spec-repository.js';
import { hashSpec, hashToolVersion } from '../utils/hash.js';

let globalDb: GlobalDatabaseService;

describe('Repository Layer (Spec & ToolVersion)', () => {
  beforeAll(async () => {
    globalDb = new GlobalDatabaseService();
    await globalDb.initialize();
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
      metadata: { tag: 'test' }
    };
    const first = await repo.createOrGet(input);
    const second = await repo.createOrGet(input);
    expect(first.hash).toBe(second.hash);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);

    const expectedHash = hashSpec({
      executor_type: 'generic-executor',
      executor_version: '1.0.0',
      intent: 'human',
      side_effect: false,
      content_template: 'Echo: {{input}}',
      static_params: { a: 1 },
      input_schema: { type: 'object', properties: { input: { type: 'string' } } },
      output_schema: { type: 'object', properties: { output: { type: 'string' } } },
      idempotency_key_template: '{{input}}',
      retry_policy: { max: 1 },
      show_output: true,
      security: { allow: ['*'] },
      metadata: { tag: 'test' }
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
      metadata: {}
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
});
