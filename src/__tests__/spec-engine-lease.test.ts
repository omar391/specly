import { describe, it, expect, vi } from 'vitest';
import { SpecEngine, ToolGraph, ClientStateLeaseProvider, SpecExecutor, SpecEngineErrorCode } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';

function node(hash: string, intent: 'human' | 'autonomous' = 'autonomous') {
  return { hash, intent, sideEffect: false };
}

class CountingLeaseProvider implements ClientStateLeaseProvider {
  acquire = vi.fn(async () => ({ leaseId: 'L1' }));
  renew = vi.fn(async () => {});
  release = vi.fn(async () => {});
}

class SimpleExecutor implements SpecExecutor {
  async execute(specHash: string) { return { spec: specHash }; }
}

describe('SpecEngine Lease Semantics (SP-005 Phase 2)', () => {
  it('acquires and releases lease with renewal cadence', async () => {
    const lease = new CountingLeaseProvider();
    const engine = new SpecEngine({ leaseProvider: lease, leaseRenewEvery: 2, executor: new SimpleExecutor() });
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
      .addSpec({ hash: 'B', intent: 'autonomous' })
      .addSpec({ hash: 'C', intent: 'autonomous' })
      .addSpec({ hash: 'D', intent: 'autonomous' })
      .addEdge('A', 'B')
      .addEdge('B', 'C')
      .addEdge('C', 'D')
    );
    const ctx = await engine.run(graph, { sessionId: 'S1', clientId: 'client-1' });
    expect(ctx.status).toBe('completed');
    expect(lease.acquire).toHaveBeenCalledTimes(1);
    // 4 specs, renew every 2 -> 2 renew calls
    expect(lease.renew).toHaveBeenCalledTimes(2);
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('returns error when lease acquisition fails', async () => {
  const failingLease: ClientStateLeaseProvider = {
      acquire: async () => { throw new Error('conflict'); },
      renew: async () => {},
      release: async () => {}
    };
    const engine = new SpecEngine({ leaseProvider: failingLease });
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
    );
    const ctx = await engine.run(graph, { sessionId: 'S1', clientId: 'client-X' });
    expect(ctx.status).toBe('error');
    expect(ctx.error?.message).toMatch(/Lease acquisition failed/);
    expect(ctx.errorCode).toBe(SpecEngineErrorCode.LEASE_ACQUIRE_FAILED);
  });

  it('returns error when lease renewal fails mid-run', async () => {
    // Fail on second renewal attempt
  const lease: ClientStateLeaseProvider = {
      acquire: async () => ({ leaseId: 'L2' }),
      renew: vi.fn(async () => { throw new Error('lost'); }),
      release: async () => {}
    };
    // Graph with enough specs to trigger renewal after first spec when leaseRenewEvery=1
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
      .addSpec({ hash: 'B', intent: 'autonomous' })
      .addEdge('A', 'B')
    );
    const engine = new SpecEngine({ leaseProvider: lease, leaseRenewEvery: 1 });
    const ctx = await engine.run(graph, { sessionId: 'S2', clientId: 'client-Y' });
    // After executing A, renewal fails before B
    expect(ctx.status).toBe('error');
    expect(ctx.error?.message).toMatch(/Lease renewal failed/);
  });
});
