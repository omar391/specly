import { describe, it, expect, beforeEach } from 'vitest';
import { createTestInstanceRegistry, createSharedTestInstanceHelpers } from '../test-instance-registry.js';

describe('createTestInstanceRegistry', () => {
    interface Payload {
        id: string;
        value: number;
    }

    const initialPayload: Payload = { id: 'alpha', value: 1 };
    const updatedPayload: Payload = { id: 'beta', value: 42 };

    it('stores and retrieves payloads with initialization state', () => {
        const registry = createTestInstanceRegistry<Payload>();

        const initialState = registry.get();
        expect(initialState.value).toBeNull();
        expect(initialState.isInitialized).toBe(false);
        expect(registry.has()).toBe(false);

        registry.set(initialPayload);

        const afterSet = registry.get();
        expect(afterSet.value).toEqual(initialPayload);
        expect(afterSet.isInitialized).toBe(true);
        expect(registry.has()).toBe(true);

        registry.set(updatedPayload);

        const afterUpdate = registry.get();
        expect(afterUpdate.value).toEqual(updatedPayload);
        expect(afterUpdate.isInitialized).toBe(true);
    });

    it('resets stored payloads and initialization state', () => {
        const registry = createTestInstanceRegistry<Payload>();
        registry.set(initialPayload);

        registry.reset();
        const resetState = registry.get();

        expect(resetState.value).toBeNull();
        expect(resetState.isInitialized).toBe(false);
        expect(registry.has()).toBe(false);
    });

    it('allows independent registries to coexist without leaking state', () => {
        const first = createTestInstanceRegistry<Payload>();
        const second = createTestInstanceRegistry<Payload>();

        first.set(initialPayload);
        second.set(updatedPayload);

        expect(first.get().value).toEqual(initialPayload);
        expect(second.get().value).toEqual(updatedPayload);

        first.reset();

        expect(first.has()).toBe(false);
        expect(second.has()).toBe(true);
        expect(second.get().value).toEqual(updatedPayload);
    });
});

describe('createSharedTestInstanceHelpers', () => {
    interface SharedPayload {
        name: string;
        connected: boolean;
    }

    const helpers = createSharedTestInstanceHelpers<SharedPayload>();

    beforeEach(() => {
        helpers.reset();
    });

    it('exposes convenience helpers for singleton-style registries', () => {
        expect(helpers.get()).toEqual({ value: null, isInitialized: false });
        expect(helpers.has()).toBe(false);

        helpers.set({ name: 'primary', connected: true });

        const state = helpers.get();
        expect(state.isInitialized).toBe(true);
        expect(state.value).toEqual({ name: 'primary', connected: true });
        expect(helpers.has()).toBe(true);
    });

    it('resets singleton registry state', () => {
        helpers.set({ name: 'primary', connected: true });
        helpers.reset();

        expect(helpers.get()).toEqual({ value: null, isInitialized: false });
        expect(helpers.has()).toBe(false);
    });
});
