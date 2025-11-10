import type { TestInstanceState } from './test-instance-registry.js';
import { createSharedTestInstanceHelpers } from './test-instance-registry.js';

export interface TestInstanceAccessors<T> {
    setInstances(value: T): void;
    resetInstances(): void;
    getInstances(): TestInstanceState<T>;
    hasInstances(): boolean;
}

export function createTestInstanceAccessors<T>(): TestInstanceAccessors<T> {
    const helpers = createSharedTestInstanceHelpers<T>();

    return {
        setInstances: helpers.set,
        resetInstances: helpers.reset,
        getInstances: helpers.get,
        hasInstances: helpers.has,
    };
}
