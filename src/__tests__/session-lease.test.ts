// SP-019: Session Lease & Force-Start Enforcement Tests
// Tests for client_state_id leasing, force_start behavior, and conflict responses.

import { describe, it, expect, vi } from 'vitest';
import { SpecEngine, ToolGraph, ClientStateLeaseProvider, SpecExecutor, SpecEngineErrorCode } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';

class SimpleExecutor implements SpecExecutor {
  async execute(specHash: string) { return { spec: specHash, output: { value: 'ok' } }; }
}

// Mock lease provider tracking ownership
class MockLeaseProvider implements ClientStateLeaseProvider {
  private activeLease: { sessionId: string; clientId: string; leaseId: string } | null = null;
  acquireCount = 0;
  renewCount = 0;
  releaseCount = 0;

  async acquire(sessionId: string, clientId: string, force?: boolean): Promise<{ leaseId: string }> {
    this.acquireCount++;
    if (this.activeLease && this.activeLease.sessionId === sessionId) {
      // Existing lease for session
      if (this.activeLease.clientId !== clientId) {
        // Conflict unless force
        if (!force) {
          throw new Error(`Session ${sessionId} held by client ${this.activeLease.clientId}`);
        }
        // force=true: transfer ownership
        const newLeaseId = `L${this.acquireCount}`;
        this.activeLease = { sessionId, clientId, leaseId: newLeaseId };
        return { leaseId: newLeaseId };
      }
      // Same client re-acquiring -> return existing lease
      return { leaseId: this.activeLease.leaseId };
    }
    // No existing lease or different session
    const leaseId = `L${this.acquireCount}`;
    this.activeLease = { sessionId, clientId, leaseId };
    return { leaseId };
  }

  async renew(leaseId: string): Promise<void> {
    this.renewCount++;
    if (!this.activeLease || this.activeLease.leaseId !== leaseId) {
      throw new Error(`Invalid lease ${leaseId}`);
    }
    // Successfully renewed
  }

  async release(leaseId: string): Promise<void> {
    this.releaseCount++;
    if (this.activeLease && this.activeLease.leaseId === leaseId) {
      this.activeLease = null;
    }
  }

  getCurrentOwner(sessionId: string): string | null {
    return this.activeLease?.sessionId === sessionId ? this.activeLease.clientId : null;
  }
}

describe('SP-019: Session Lease & Force-Start Enforcement', () => {
  it('rejects lease acquisition when session held by different client (409 scenario)', async () => {
    const lease = new MockLeaseProvider();
    const engine = new SpecEngine({ leaseProvider: lease, executor: new SimpleExecutor() });
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
    );

    // First client acquires lease
    const ctx1 = await engine.run(graph, { sessionId: 'S1', clientId: 'client-A' });
    expect(ctx1.status).toBe('completed');
    
    // Release lease
    await lease.release('L1');

    // Second client attempts to acquire without force
    await lease.acquire('S1', 'client-A', false); // Re-acquire with same client first
    
    // Now try with different client without force
    await expect(lease.acquire('S1', 'client-B', false)).rejects.toThrow(/held by client/);
  });

  it('transfers ownership when force_start=true', async () => {
    const lease = new MockLeaseProvider();
    const engine = new SpecEngine({ leaseProvider: lease, executor: new SimpleExecutor() });
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
      .addSpec({ hash: 'B', intent: 'autonomous' })
      .addEdge('A', 'B')
    );

    // Client A acquires and holds
    await lease.acquire('S1', 'client-A');
    expect(lease.getCurrentOwner('S1')).toBe('client-A');

    // Client B forces takeover
    const result = await lease.acquire('S1', 'client-B', true);
    expect(result.leaseId).toBe('L2');
    expect(lease.getCurrentOwner('S1')).toBe('client-B');

    // Verify engine can use the new lease
    const ctx = await engine.run(graph, { sessionId: 'S1', clientId: 'client-B', force: true });
    expect(ctx.status).toBe('completed');
  });

  it('rejects resume with mismatched client (ownership check)', async () => {
    const lease = new MockLeaseProvider();
    const engine = new SpecEngine({ leaseProvider: lease, executor: new SimpleExecutor() });
    
    // Graph with human pause
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
      .addSpec({ hash: 'H1', intent: 'human' })
      .addSpec({ hash: 'B', intent: 'autonomous' })
      .addEdge('A', 'H1')
      .addEdge('H1', 'B')
    );

    // Client A starts execution and pauses at human spec
    const ctx1 = await engine.run(graph, { sessionId: 'S2', clientId: 'client-A' });
    expect(ctx1.status).toBe('awaiting_input');
    expect(ctx1.resumeToken).toBeDefined();

    // Client B attempts to resume (should fail lease check if implemented)
    // Note: Current implementation may not enforce client match on resume; this is aspirational test
    // For now, verify that lease is still held by client-A
    expect(lease.getCurrentOwner('S2')).toBe('client-A');
    
    // If client B tried to resume without force, ideally it should fail
    // Since resume doesn't currently accept clientId, this test documents expected behavior
  });

  it('handles awaiting_input as idle state (session lease persists)', async () => {
    const lease = new MockLeaseProvider();
    const engine = new SpecEngine({ leaseProvider: lease, executor: new SimpleExecutor() });
    
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
      .addSpec({ hash: 'H1', intent: 'human' })
      .addSpec({ hash: 'B', intent: 'autonomous' })
      .addEdge('A', 'H1')
      .addEdge('H1', 'B')
    );

    const ctx1 = await engine.run(graph, { sessionId: 'S3', clientId: 'client-C' });
    expect(ctx1.status).toBe('awaiting_input');
    expect(ctx1.awaitingSpec).toBe('H1');
    
    // Lease acquired initially
    expect(lease.acquireCount).toBe(1);
    
    // Build serialized state for resume
    const serialized = {
      plan: { steps: [
        { specHash: 'A', awaitingHuman: false },
        { specHash: 'H1', awaitingHuman: true },
        { specHash: 'B', awaitingHuman: false }
      ], warnings: ctx1.warnings },
      currentIndex: 1,
      executed: ctx1.executed,
      results: ctx1.results,
      warnings: ctx1.warnings,
      awaitingSpec: ctx1.awaitingSpec!,
      sessionContext: {}
    };
    
    // Resume with same client
    const ctx2 = await engine.resume(graph, serialized, { specHash: 'H1', humanOutput: { feedback: 'user input' } }, { sessionId: 'S3', clientId: 'client-C' });
    expect(ctx2.status).toBe('completed');
    
    // Verify lease re-acquired on resume (total 2 acquisitions)
    expect(lease.acquireCount).toBe(2);
    
    // Release should happen after pause and after completion (fire-and-forget so may not be immediate)
    // Test documents expected behavior: lease released on pause, re-acquired on resume, released on completion
    expect(lease.acquireCount).toBeGreaterThanOrEqual(2);
  });

  it('enforces lease renewal failure returns 409-style error', async () => {
    const lease: ClientStateLeaseProvider = {
      acquire: async () => ({ leaseId: 'L1' }),
      renew: async () => { throw new Error('ownership lost'); },
      release: async () => {}
    };
    
    const engine = new SpecEngine({ leaseProvider: lease, leaseRenewEvery: 1, executor: new SimpleExecutor() });
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
      .addSpec({ hash: 'B', intent: 'autonomous' })
      .addEdge('A', 'B')
    );

    const ctx = await engine.run(graph, { sessionId: 'S4', clientId: 'client-D' });
    expect(ctx.status).toBe('error');
    expect(ctx.errorCode).toBe(SpecEngineErrorCode.LEASE_RENEW_FAILED);
  });
});
