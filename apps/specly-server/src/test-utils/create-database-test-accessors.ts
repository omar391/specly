/**
 * Generic registry for injecting test-only instances into shared modules.
 *
 * Useful when a package needs to expose mutable hooks (e.g. CLI databases)
 * that test suites must override without introducing production dependencies.
 */

export interface TestInstanceState<T> {
    value: T | null;
    isInitialized: boolean;
}

export interface TestInstanceRegistry<T> {
    set(value: T): void;
    reset(): void;
    get(): TestInstanceState<T>;
    has(): boolean;
}

/**
 * Create an isolated registry for a specific test instance payload.
 */
export function createTestInstanceRegistry<T>(): TestInstanceRegistry<T> {
    let storedValue: T | null = null;
    let initialized = false;

    return {
        set(value: T) {
            storedValue = value;
            initialized = true;
        },
        reset() {
            storedValue = null;
            initialized = false;
        },
        get(): TestInstanceState<T> {
            return {
                value: storedValue,
                isInitialized: initialized,
            };
        },
        has(): boolean {
            return initialized && storedValue !== null;
        },
    };
}

/**
 * Create a singleton-style registry with convenience helpers.
 */
export function createSharedTestInstanceHelpers<T>() {
    const registry = createTestInstanceRegistry<T>();

    const set = (value: T): void => {
        registry.set(value);
    };

    const reset = (): void => {
        registry.reset();
    };

    const get = (): TestInstanceState<T> => {
        return registry.get();
    };

    const has = (): boolean => {
        return registry.has();
    };

    return { set, reset, get, has };
}

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

export interface DatabaseTestInstances<TDrizzleManager, TDbService> {
    drizzleManager: TDrizzleManager;
    dbService: TDbService;
}

export function createDatabaseTestAccessors<TDrizzleManager, TDbService>(): TestInstanceAccessors<DatabaseTestInstances<TDrizzleManager, TDbService>> {
    return createTestInstanceAccessors<DatabaseTestInstances<TDrizzleManager, TDbService>>();
}
