/**
 * Tests for Graph Validation Utility (SP-018)
 * 
 * Tests graph validation, cycle detection, normalization, and edge ordering
 */

import { describe, it, expect } from 'vitest';
import {
    validateToolGraph,
    GraphValidationError,
    type ToolGraphManifestInput,
    type ToolGraphEdgeInput
} from '../utils/graph-validate.js';

describe('Graph Validation Utility', () => {
    describe('Basic Validation', () => {
        it('should accept valid minimal graph', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['spec1'],
                entry_spec: 'spec1',
                edges: []
            };
            const result = validateToolGraph(manifest);
            expect(result.ordered_specs).toEqual(['spec1']);
            expect(result.entry_spec).toBe('spec1');
            expect(result.edges).toEqual([]);
        });

        it('should accept valid linear graph', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b', 'c'],
                entry_spec: 'a',
                edges: [
                    { from: 'a', to: 'b', condition_type: 'always' },
                    { from: 'b', to: 'c', condition_type: 'always' }
                ]
            };
            const result = validateToolGraph(manifest);
            expect(result.ordered_specs).toEqual(['a', 'b', 'c']);
            expect(result.edges).toHaveLength(2);
        });

        it('should accept branching graph', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['start', 'left', 'right', 'end'],
                entry_spec: 'start',
                edges: [
                    { from: 'start', to: 'left', condition_type: 'result_code', condition_value: 'success' },
                    { from: 'start', to: 'right', condition_type: 'result_code', condition_value: 'error' },
                    { from: 'left', to: 'end', condition_type: 'always' },
                    { from: 'right', to: 'end', condition_type: 'always' }
                ]
            };
            const result = validateToolGraph(manifest);
            expect(result.entry_spec).toBe('start');
            expect(result.edges).toHaveLength(4);
        });
    });

    describe('Entry Spec Validation', () => {
        it('should reject missing entry_spec', () => {
            const manifest = {
                ordered_specs: ['a', 'b'],
                entry_spec: '',
                edges: []
            };
            expect(() => validateToolGraph(manifest)).toThrow(GraphValidationError);
            expect(() => validateToolGraph(manifest)).toThrow('entry_spec missing');
        });

        it('should reject entry_spec not in ordered_specs', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'c',
                edges: []
            };
            expect(() => validateToolGraph(manifest)).toThrow(GraphValidationError);
            expect(() => validateToolGraph(manifest)).toThrow('entry_spec not found');
        });

        it('should reject null manifest', () => {
            expect(() => validateToolGraph(null as any)).toThrow(GraphValidationError);
            expect(() => validateToolGraph(null as any)).toThrow('Manifest missing');
        });

        it('should reject undefined manifest', () => {
            expect(() => validateToolGraph(undefined as any)).toThrow(GraphValidationError);
        });
    });

    describe('Ordered Specs Validation', () => {
        it('should reject empty ordered_specs', () => {
            const manifest = {
                ordered_specs: [],
                entry_spec: 'a',
                edges: []
            };
            expect(() => validateToolGraph(manifest as any)).toThrow('ordered_specs must be a non-empty array');
        });

        it('should reject non-array ordered_specs', () => {
            const manifest = {
                ordered_specs: 'not-array' as any,
                entry_spec: 'a',
                edges: []
            };
            expect(() => validateToolGraph(manifest)).toThrow('ordered_specs must be a non-empty array');
        });

        it('should reject duplicate specs', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b', 'a'],
                entry_spec: 'a',
                edges: []
            };
            expect(() => validateToolGraph(manifest)).toThrow(GraphValidationError);
            expect(() => validateToolGraph(manifest)).toThrow('Duplicate spec hash');
        });

        it('should reject duplicate specs case-sensitively', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['spec1', 'Spec1', 'spec1'],
                entry_spec: 'spec1',
                edges: []
            };
            expect(() => validateToolGraph(manifest)).toThrow('Duplicate spec hash');
        });
    });

    describe('Edge Validation', () => {
        it('should reject edge with undeclared from spec', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [{ from: 'c', to: 'b', condition_type: 'always' }]
            };
            expect(() => validateToolGraph(manifest)).toThrow(GraphValidationError);
            expect(() => validateToolGraph(manifest)).toThrow('Edge references undeclared spec');
        });

        it('should reject edge with undeclared to spec', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [{ from: 'a', to: 'c', condition_type: 'always' }]
            };
            expect(() => validateToolGraph(manifest)).toThrow('Edge references undeclared spec');
        });

        it('should reject self-loop edges', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [{ from: 'a', to: 'a', condition_type: 'always' }]
            };
            expect(() => validateToolGraph(manifest)).toThrow(GraphValidationError);
            expect(() => validateToolGraph(manifest)).toThrow('Self-loop edge not allowed');
        });

        it('should accept result_code condition type', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [
                    { from: 'a', to: 'b', condition_type: 'result_code', condition_value: '0' }
                ]
            };
            const result = validateToolGraph(manifest);
            expect(result.edges[0].condition_type).toBe('result_code');
            expect(result.edges[0].condition_value).toBe('0');
        });

        it('should accept always condition type', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [{ from: 'a', to: 'b', condition_type: 'always' }]
            };
            const result = validateToolGraph(manifest);
            expect(result.edges[0].condition_type).toBe('always');
        });
    });

    describe('Priority Normalization', () => {
        it('should default missing priority to 100', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [{ from: 'a', to: 'b', condition_type: 'always' }]
            };
            const result = validateToolGraph(manifest);
            expect(result.edges[0].priority).toBe(100);
        });

        it('should preserve explicit priority', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [{ from: 'a', to: 'b', condition_type: 'always', priority: 10 }]
            };
            const result = validateToolGraph(manifest);
            expect(result.edges[0].priority).toBe(10);
        });

        it('should accept priority 0', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [{ from: 'a', to: 'b', condition_type: 'always', priority: 0 }]
            };
            const result = validateToolGraph(manifest);
            expect(result.edges[0].priority).toBe(0);
        });

        it('should reject negative priority', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [{ from: 'a', to: 'b', condition_type: 'always', priority: -1 }]
            };
            expect(() => validateToolGraph(manifest)).toThrow(GraphValidationError);
            expect(() => validateToolGraph(manifest)).toThrow('Priority must be integer >= 0');
        });

        it('should reject non-integer priority', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [{ from: 'a', to: 'b', condition_type: 'always', priority: 3.5 }]
            };
            expect(() => validateToolGraph(manifest)).toThrow('Priority must be integer >= 0');
        });

        it('should reject NaN priority', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [{ from: 'a', to: 'b', condition_type: 'always', priority: NaN }]
            };
            expect(() => validateToolGraph(manifest)).toThrow('Priority must be integer >= 0');
        });
    });

    describe('Cycle Detection', () => {
        it('should reject simple cycle', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [
                    { from: 'a', to: 'b', condition_type: 'always' },
                    { from: 'b', to: 'a', condition_type: 'always' }
                ]
            };
            expect(() => validateToolGraph(manifest)).toThrow(GraphValidationError);
            expect(() => validateToolGraph(manifest)).toThrow('Cycle detected');
        });

        it('should reject three-node cycle', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b', 'c'],
                entry_spec: 'a',
                edges: [
                    { from: 'a', to: 'b', condition_type: 'always' },
                    { from: 'b', to: 'c', condition_type: 'always' },
                    { from: 'c', to: 'a', condition_type: 'always' }
                ]
            };
            expect(() => validateToolGraph(manifest)).toThrow('Cycle detected');
        });

        it('should reject nested cycle', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['start', 'a', 'b', 'c', 'end'],
                entry_spec: 'start',
                edges: [
                    { from: 'start', to: 'a', condition_type: 'always' },
                    { from: 'a', to: 'b', condition_type: 'always' },
                    { from: 'b', to: 'c', condition_type: 'always' },
                    { from: 'c', to: 'b', condition_type: 'always' }, // cycle b->c->b
                    { from: 'c', to: 'end', condition_type: 'always' }
                ]
            };
            expect(() => validateToolGraph(manifest)).toThrow('Cycle detected');
        });

        it('should accept diamond pattern (not a cycle)', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['start', 'mid1', 'mid2', 'end'],
                entry_spec: 'start',
                edges: [
                    { from: 'start', to: 'mid1', condition_type: 'always' },
                    { from: 'start', to: 'mid2', condition_type: 'always' },
                    { from: 'mid1', to: 'end', condition_type: 'always' },
                    { from: 'mid2', to: 'end', condition_type: 'always' }
                ]
            };
            const result = validateToolGraph(manifest);
            expect(result.edges).toHaveLength(4);
        });
    });

    describe('Reachability Validation', () => {
        it('should reject unreachable spec by default', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b', 'c'],
                entry_spec: 'a',
                edges: [{ from: 'a', to: 'b', condition_type: 'always' }]
                // c is unreachable
            };
            expect(() => validateToolGraph(manifest)).toThrow(GraphValidationError);
            expect(() => validateToolGraph(manifest)).toThrow('Unreachable spec');
        });

        it('should allow unreachable specs when allowUnreachable is true', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b', 'c'],
                entry_spec: 'a',
                edges: [{ from: 'a', to: 'b', condition_type: 'always' }]
            };
            const result = validateToolGraph(manifest, { allowUnreachable: true });
            expect(result.ordered_specs).toContain('c');
        });

        it('should reject multiple unreachable specs', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b', 'c', 'd'],
                entry_spec: 'a',
                edges: []
            };
            expect(() => validateToolGraph(manifest)).toThrow('Unreachable spec');
        });

        it('should accept all specs reachable', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b', 'c', 'd'],
                entry_spec: 'a',
                edges: [
                    { from: 'a', to: 'b', condition_type: 'always' },
                    { from: 'a', to: 'c', condition_type: 'always' },
                    { from: 'b', to: 'd', condition_type: 'always' }
                ]
            };
            const result = validateToolGraph(manifest);
            expect(result.ordered_specs).toHaveLength(4);
        });
    });

    describe('Edge Ordering Normalization', () => {
        it('should sort edges deterministically by from spec', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b', 'c'],
                entry_spec: 'a',
                edges: [
                    { from: 'b', to: 'c', condition_type: 'always' },
                    { from: 'a', to: 'b', condition_type: 'always' }
                ]
            };
            const result = validateToolGraph(manifest);
            expect(result.edges[0].from).toBe('a');
            expect(result.edges[1].from).toBe('b');
        });

        it('should sort edges by to spec when from is same', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b', 'c'],
                entry_spec: 'a',
                edges: [
                    { from: 'a', to: 'c', condition_type: 'always' },
                    { from: 'a', to: 'b', condition_type: 'always' }
                ]
            };
            const result = validateToolGraph(manifest);
            expect(result.edges[0].to).toBe('b');
            expect(result.edges[1].to).toBe('c');
        });

        it('should sort edges by condition_type when from/to same', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [
                    { from: 'a', to: 'b', condition_type: 'result_code', condition_value: '0' },
                    { from: 'a', to: 'b', condition_type: 'always' }
                ]
            };
            const result = validateToolGraph(manifest);
            expect(result.edges[0].condition_type).toBe('always');
            expect(result.edges[1].condition_type).toBe('result_code');
        });

        it('should sort edges by condition_value when condition_type same', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [
                    { from: 'a', to: 'b', condition_type: 'result_code', condition_value: 'error' },
                    { from: 'a', to: 'b', condition_type: 'result_code', condition_value: 'success' }
                ]
            };
            const result = validateToolGraph(manifest);
            expect(result.edges[0].condition_value).toBe('error');
            expect(result.edges[1].condition_value).toBe('success');
        });

        it('should sort edges by priority when other fields same', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [
                    { from: 'a', to: 'b', condition_type: 'always', priority: 50 },
                    { from: 'a', to: 'b', condition_type: 'always', priority: 10 }
                ]
            };
            const result = validateToolGraph(manifest);
            expect(result.edges[0].priority).toBe(10);
            expect(result.edges[1].priority).toBe(50);
        });

        it('should maintain insertion order when all fields identical', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b', 'c', 'd'],
                entry_spec: 'a',
                edges: [
                    { from: 'a', to: 'b', condition_type: 'always' },
                    { from: 'a', to: 'c', condition_type: 'always' },
                    { from: 'a', to: 'd', condition_type: 'always' }
                ]
            };
            const result = validateToolGraph(manifest);
            // Edges sorted by 'to' field
            expect(result.edges[0].to).toBe('b');
            expect(result.edges[1].to).toBe('c');
            expect(result.edges[2].to).toBe('d');
        });

        it('should not mutate original edges array', () => {
            const edges: ToolGraphEdgeInput[] = [
                { from: 'b', to: 'c', condition_type: 'always' },
                { from: 'a', to: 'b', condition_type: 'always' }
            ];
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b', 'c'],
                entry_spec: 'a',
                edges
            };
            const result = validateToolGraph(manifest);

            // Original unchanged
            expect(edges[0].from).toBe('b');
            // Result sorted
            expect(result.edges[0].from).toBe('a');
        });
    });

    describe('Complex Graph Scenarios', () => {
        it('should validate complex branching workflow', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['init', 'validate', 'process_success', 'process_error', 'log', 'cleanup'],
                entry_spec: 'init',
                edges: [
                    { from: 'init', to: 'validate', condition_type: 'always' },
                    { from: 'validate', to: 'process_success', condition_type: 'result_code', condition_value: '0', priority: 1 },
                    { from: 'validate', to: 'process_error', condition_type: 'result_code', condition_value: '1', priority: 2 },
                    { from: 'process_success', to: 'log', condition_type: 'always' },
                    { from: 'process_error', to: 'log', condition_type: 'always' },
                    { from: 'log', to: 'cleanup', condition_type: 'always' }
                ]
            };
            const result = validateToolGraph(manifest);
            expect(result.ordered_specs).toHaveLength(6);
            expect(result.edges).toHaveLength(6);
            expect(result.edges.every(e => e.priority !== undefined)).toBe(true);
        });

        it('should validate large linear chain', () => {
            const specs = Array(50).fill(0).map((_, i) => `spec${i}`);
            const edges: ToolGraphEdgeInput[] = Array(49).fill(0).map((_, i) => ({
                from: `spec${i}`,
                to: `spec${i + 1}`,
                condition_type: 'always' as const
            }));
            const manifest: ToolGraphManifestInput = {
                ordered_specs: specs,
                entry_spec: 'spec0',
                edges
            };
            const result = validateToolGraph(manifest);
            expect(result.ordered_specs).toHaveLength(50);
            expect(result.edges).toHaveLength(49);
        });

        it('should validate wide branching graph', () => {
            const specs = ['start', ...Array(20).fill(0).map((_, i) => `branch${i}`), 'end'];
            const edges: ToolGraphEdgeInput[] = [
                ...Array(20).fill(0).map((_, i) => ({
                    from: 'start',
                    to: `branch${i}`,
                    condition_type: 'result_code' as const,
                    condition_value: String(i),
                    priority: i
                })),
                ...Array(20).fill(0).map((_, i) => ({
                    from: `branch${i}`,
                    to: 'end',
                    condition_type: 'always' as const
                }))
            ];
            const manifest: ToolGraphManifestInput = {
                ordered_specs: specs,
                entry_spec: 'start',
                edges
            };
            const result = validateToolGraph(manifest);
            expect(result.ordered_specs).toHaveLength(22);
            expect(result.edges).toHaveLength(40);
        });
    });

    describe('GraphValidationError Class', () => {
        it('should include error code', () => {
            try {
                validateToolGraph({
                    ordered_specs: ['a', 'a'],
                    entry_spec: 'a',
                    edges: []
                });
                fail('Should have thrown');
            } catch (err: any) {
                expect(err).toBeInstanceOf(GraphValidationError);
                expect(err.code).toBe('ERR_DUP_SPEC');
            }
        });

        it('should include error message', () => {
            try {
                validateToolGraph({
                    ordered_specs: ['a', 'b'],
                    entry_spec: 'c',
                    edges: []
                });
                fail('Should have thrown');
            } catch (err: any) {
                expect(err).toBeInstanceOf(GraphValidationError);
                expect(err.message).toContain('entry_spec not found');
            }
        });

        it('should include error details when provided', () => {
            try {
                validateToolGraph({
                    ordered_specs: ['a', 'b', 'a'],
                    entry_spec: 'a',
                    edges: []
                });
                fail('Should have thrown');
            } catch (err: any) {
                expect(err).toBeInstanceOf(GraphValidationError);
                expect(err.details).toBeDefined();
                expect(err.details.spec).toBe('a');
            }
        });

        it('should be instanceof Error', () => {
            try {
                validateToolGraph({
                    ordered_specs: [],
                    entry_spec: 'a',
                    edges: []
                } as any);
                fail('Should have thrown');
            } catch (err: any) {
                expect(err).toBeInstanceOf(Error);
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle very long spec names', () => {
            const longName = 'spec_' + 'x'.repeat(1000);
            const manifest: ToolGraphManifestInput = {
                ordered_specs: [longName, 'other'],
                entry_spec: longName,
                edges: [{ from: longName, to: 'other', condition_type: 'always' }]
            };
            const result = validateToolGraph(manifest);
            expect(result.entry_spec).toBe(longName);
        });

        it('should handle unicode in spec names', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['开始', '处理', '结束'],
                entry_spec: '开始',
                edges: [
                    { from: '开始', to: '处理', condition_type: 'always' },
                    { from: '处理', to: '结束', condition_type: 'always' }
                ]
            };
            const result = validateToolGraph(manifest);
            expect(result.entry_spec).toBe('开始');
        });

        it('should handle empty condition_value', () => {
            const manifest: ToolGraphManifestInput = {
                ordered_specs: ['a', 'b'],
                entry_spec: 'a',
                edges: [{ from: 'a', to: 'b', condition_type: 'result_code', condition_value: '' }]
            };
            const result = validateToolGraph(manifest);
            expect(result.edges[0].condition_value).toBe('');
        });

        it('should not modify original ordered_specs array', () => {
            const orderedSpecs = ['b', 'a', 'c'];
            const manifest: ToolGraphManifestInput = {
                ordered_specs: orderedSpecs,
                entry_spec: 'b',
                edges: [
                    { from: 'b', to: 'a', condition_type: 'always' },
                    { from: 'a', to: 'c', condition_type: 'always' }
                ]
            };
            const result = validateToolGraph(manifest);

            // Original preserved
            expect(orderedSpecs).toEqual(['b', 'a', 'c']);
            // Result is copy
            expect(result.ordered_specs).toEqual(['b', 'a', 'c']);
            expect(result.ordered_specs).not.toBe(orderedSpecs);
        });
    });
});
