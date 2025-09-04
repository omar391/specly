import { describe, it, expect } from 'vitest';
import { SpecEngine, ToolGraph, ExecutionPlanner, ExecutionPlan, SpecEngineErrorCode } from '../services/spec-engine.js';

class DeadEndPlanner implements ExecutionPlanner {
    buildPlan(_graph: ToolGraph): ExecutionPlan {
        // Purposely omit second autonomous node to simulate planner gap leading to dead-end
        return { steps: [{ specHash: 'a1', awaitingHuman: false }], warnings: [] };
    }
}

describe('SpecEngine dead-end routing simulation', () => {
    it('fails with ROUTE_DEAD_END when plan omits reachable successor', async () => {
        const graph: ToolGraph = {
            entry: 'a1',
            nodes: {
                a1: { hash: 'a1', intent: 'autonomous', sideEffect: false },
                a2: { hash: 'a2', intent: 'autonomous', sideEffect: false }
            },
            edges: [{ from: 'a1', to: 'a2', priority: 100 }]
        };
        const engine = new SpecEngine({ planner: new DeadEndPlanner() });
        const result = await engine.run(graph);
        expect(result.status).toBe('error');
        expect(result.errorCode).toBe(SpecEngineErrorCode.ROUTE_DEAD_END);
    });
});
