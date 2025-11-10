import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectRuntime, isNodeLike, isEdgeRuntime, getRuntimeInfo, clearRuntimeCache } from '../runtime.js';

describe('Runtime Detection', () => {
    const originalGlobalThis = globalThis;
    const originalProcess = global.process;

    beforeEach(() => {
        // Clear cached runtime info
        clearRuntimeCache();

        // Clean up any test globals
        delete (globalThis as any).Bun;
        delete (globalThis as any).Deno;
        delete (globalThis as any).caches;
        delete (globalThis as any).WebSocketPair;
        delete (globalThis as any).__VERCEL__;
        delete (globalThis as any).Netlify;
        delete (globalThis as any).fetch;
    });

    afterEach(() => {
        // Restore original globals
        Object.defineProperty(globalThis, 'process', {
            value: originalProcess,
            writable: true,
            configurable: true
        });
    });

    describe('detectRuntime', () => {
        it('should detect Node.js environment', () => {
            const runtime = detectRuntime();
            expect(runtime.name).toBe('node');
            expect(runtime.isNode).toBe(true);
            expect(runtime.isBun).toBe(false);
            expect(runtime.isDeno).toBe(false);
            expect(runtime.version).toBeDefined();
            expect(runtime.hasFetch).toBeDefined(); // fetch availability depends on Node version
        });

        it('should detect Bun environment', () => {
            // Mock Bun global
            (globalThis as any).Bun = { version: '1.0.0' };
            // Remove process to simulate non-Node environment
            Object.defineProperty(globalThis, 'process', {
                value: undefined,
                writable: true,
                configurable: true
            });

            const runtime = detectRuntime();
            expect(runtime.name).toBe('bun');
            expect(runtime.isBun).toBe(true);
            expect(runtime.isNode).toBe(false);
            expect(runtime.version).toBe('1.0.0');
        });

        it('should detect Deno environment', () => {
            // Mock Deno global
            (globalThis as any).Deno = { version: { deno: '1.30.0' } };
            // Remove process to simulate non-Node environment
            Object.defineProperty(globalThis, 'process', {
                value: undefined,
                writable: true,
                configurable: true
            });

            const runtime = detectRuntime();
            expect(runtime.name).toBe('deno');
            expect(runtime.isDeno).toBe(true);
            expect(runtime.isNode).toBe(false);
            expect(runtime.version).toBe('1.30.0');
        });

        it('should detect Cloudflare Workers environment', () => {
            // Mock Cloudflare globals
            (globalThis as any).caches = {};
            (globalThis as any).WebSocketPair = function () { };
            // Remove process to simulate non-Node environment
            Object.defineProperty(globalThis, 'process', {
                value: undefined,
                writable: true,
                configurable: true
            });

            const runtime = detectRuntime();
            expect(runtime.name).toBe('cloudflare');
            expect(runtime.isCloudflare).toBe(true);
            expect(runtime.isNode).toBe(false);
        });

        it('should detect Vercel environment', () => {
            // Mock Vercel environment
            (globalThis as any).__VERCEL__ = true;
            // Remove process to simulate non-Node environment
            Object.defineProperty(globalThis, 'process', {
                value: undefined,
                writable: true,
                configurable: true
            });

            const runtime = detectRuntime();
            expect(runtime.name).toBe('vercel');
            expect(runtime.isVercel).toBe(true);
        });

        it('should detect Netlify environment', () => {
            // Mock Netlify environment
            (globalThis as any).Netlify = {};
            // Remove process to simulate non-Node environment
            Object.defineProperty(globalThis, 'process', {
                value: undefined,
                writable: true,
                configurable: true
            });

            const runtime = detectRuntime();
            expect(runtime.name).toBe('netlify');
            expect(runtime.isNetlify).toBe(true);
        });

        it('should detect browser environment', () => {
            // Mock browser environment (no Node.js, Bun, Deno, or edge globals)
            Object.defineProperty(globalThis, 'process', {
                value: undefined,
                writable: true,
                configurable: true
            });
            // Ensure fetch is available
            (globalThis as any).fetch = vi.fn();

            const runtime = detectRuntime();
            expect(runtime.name).toBe('browser');
            expect(runtime.isNode).toBe(false);
            expect(runtime.isBun).toBe(false);
            expect(runtime.isDeno).toBe(false);
            expect(runtime.hasFetch).toBe(true);
        });

        it('should return unknown for unrecognized environment', () => {
            // Mock minimal environment
            Object.defineProperty(globalThis, 'process', {
                value: undefined,
                writable: true,
                configurable: true
            });
            (globalThis as any).fetch = undefined;

            const runtime = detectRuntime();
            expect(runtime.name).toBe('unknown');
            expect(runtime.hasFetch).toBe(false);
        });
    });

    describe('isNodeLike', () => {
        it('should return true for Node.js', () => {
            expect(isNodeLike()).toBe(true);
        });

        it('should return true for Bun', () => {
            // Mock Bun
            (globalThis as any).Bun = { version: '1.0.0' };
            Object.defineProperty(globalThis, 'process', {
                value: undefined,
                writable: true,
                configurable: true
            });

            expect(isNodeLike()).toBe(true);
        });

        it('should return false for edge environments', () => {
            // Mock Cloudflare
            (globalThis as any).caches = {};
            (globalThis as any).WebSocketPair = function () { };
            Object.defineProperty(globalThis, 'process', {
                value: undefined,
                writable: true,
                configurable: true
            });

            expect(isNodeLike()).toBe(false);
        });
    });

    describe('isEdgeRuntime', () => {
        it('should return false for Node.js', () => {
            expect(isEdgeRuntime()).toBe(false);
        });

        it('should return true for Cloudflare Workers', () => {
            (globalThis as any).caches = {};
            (globalThis as any).WebSocketPair = function () { };
            Object.defineProperty(globalThis, 'process', {
                value: undefined,
                writable: true,
                configurable: true
            });

            expect(isEdgeRuntime()).toBe(true);
        });

        it('should return true for Vercel', () => {
            (globalThis as any).__VERCEL__ = true;
            Object.defineProperty(globalThis, 'process', {
                value: undefined,
                writable: true,
                configurable: true
            });

            expect(isEdgeRuntime()).toBe(true);
        });

        it('should return true for Deno', () => {
            (globalThis as any).Deno = { version: { deno: '1.30.0' } };
            Object.defineProperty(globalThis, 'process', {
                value: undefined,
                writable: true,
                configurable: true
            });

            expect(isEdgeRuntime()).toBe(true);
        });
    });

    describe('getRuntimeInfo', () => {
        it('should cache runtime detection results', () => {
            const info1 = getRuntimeInfo();
            const info2 = getRuntimeInfo();

            expect(info1).toBe(info2); // Same reference (cached)
            expect(info1.name).toBe('node');
        });
    });
});