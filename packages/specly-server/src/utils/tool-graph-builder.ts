import { ToolGraph, SpecNode, ToolGraphEdge } from '../services/spec-engine.js';

/**
 * Type-safe ToolGraphBuilder
 * Uses a persistent generic parameter capturing declared spec hashes to provide
 * compile-time safety for edge endpoints. Each mutating method returns a new
 * builder instance with an expanded type parameter set (immutable pattern).
 */
export class ToolGraphBuilder<Specs extends string = never> {
    private entryHash?: Specs | string; // temporarily allow string until entry declared
    private readonly nodes: Record<string, SpecNode>;
    private readonly edges: ToolGraphEdge[];

    private constructor(nodes: Record<string, SpecNode>, edges: ToolGraphEdge[], entry?: string) {
        this.nodes = nodes;
        this.edges = edges;
        this.entryHash = entry;
    }

    static create(): ToolGraphBuilder<never> {
        return new ToolGraphBuilder<never>({}, []);
    }

    /** Declare a spec node; returns new builder with augmented type set. */
    addSpec<Hash extends string>(spec: { hash: Hash; intent: SpecNode['intent']; sideEffect?: boolean; entry?: boolean }):
        ToolGraphBuilder<Specs | Hash> {
        if (this.nodes[spec.hash]) {
            throw new Error(`Spec already declared: ${spec.hash}`);
        }
        const nextNodes = { ...this.nodes, [spec.hash]: { hash: spec.hash, intent: spec.intent, sideEffect: !!spec.sideEffect } };
        const entryHash = spec.entry ? spec.hash : this.entryHash;
        return new ToolGraphBuilder<Specs | Hash>(nextNodes, [...this.edges], entryHash);
    }

    /** Add a directed edge. Constrained so from/to must be previously declared spec hashes. */
    addEdge<From extends Specs, To extends Specs>(from: From, to: To, priority?: number): ToolGraphBuilder<Specs> {
        if (!this.nodes[from]) throw new Error(`Edge 'from' undeclared spec: ${from}`);
        if (!this.nodes[to]) throw new Error(`Edge 'to' undeclared spec: ${to}`);
        const edge: ToolGraphEdge = { from, to, priority };
        return new ToolGraphBuilder<Specs>({ ...this.nodes }, [...this.edges, edge], this.entryHash);
    }

    /** Finalize to ToolGraph structure. */
    build(): ToolGraph {
        if (!this.entryHash) throw new Error('Entry spec not set. Mark one spec with entry:true');
        return {
            entry: this.entryHash,
            nodes: this.nodes,
            edges: this.edges
        };
    }
}

/** Convenience inline helper for fluent building without explicit generics. */
export function buildToolGraph(configure: (b: ToolGraphBuilder<never>) => ToolGraphBuilder<any>): ToolGraph {
    const builder = ToolGraphBuilder.create();
    const finalBuilder = configure(builder);
    return finalBuilder.build();
}
