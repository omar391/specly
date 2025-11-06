import { describe, it, expect } from 'vitest';
import { buildToolGraph, ToolGraphBuilder } from '../utils/tool-graph-builder.js';
import { SpecEngine } from '../services/spec-engine.js';

// Note: Type-level safety (preventing undeclared edges) is enforced by TS compiler.
// We include runtime guards tests (duplicate spec, undeclared edge) to ensure clear errors.

describe('ToolGraphBuilder', () => {
    it('builds a simple linear autonomous chain', async () => {
        const graph = buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'B', intent: 'autonomous' })
            .addEdge('A', 'B')
        );
        const engine = new SpecEngine();
        const ctx = await engine.run(graph);
        expect(ctx.status).toBe('completed');
        expect(ctx.executed).toEqual(['A', 'B']);
    });

    it('throws on duplicate spec declaration', () => {
        expect(() => buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'A', intent: 'autonomous' })
        )).toThrow(/already declared/);
    });

    it('throws when adding edge referencing undeclared spec at runtime guard (should be compile-time fail if typed)', () => {
        // We force a cast to bypass TS generic safety to exercise runtime path.
        const builder = ToolGraphBuilder.create()
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unsafe = builder as any;
        expect(() => unsafe.addEdge('A', 'Z')).toThrow(/undeclared spec/);
    });

    it('requires an entry spec', () => {
        const builder = ToolGraphBuilder.create()
            .addSpec({ hash: 'A', intent: 'autonomous' });
        expect(() => builder.build()).toThrow(/Entry spec not set/);
    });
});
