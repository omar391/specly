import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import type { GlobalDatabaseService } from '../database/global-queries.js';

/**
 * Database Test Helpers
 * 
 * Provides utilities for injecting test database instances into the CLI
 * for testing purposes. These functions should only be used in test environments.
 */

// Internal state for test database instances
let testGlobalDrizzleManager: DrizzleDatabaseManager | null = null;
let testGlobalDbService: GlobalDatabaseService | null = null;
let testToolsInitialized = false;

/**
 * Set the CLI's global database instances for testing
 * This allows tests to inject their database instances into the CLI
 * 
 * @param drizzleManager - The test database manager instance
 * @param dbService - The test global database service instance
 */
export function setTestDatabaseInstances(
    drizzleManager: DrizzleDatabaseManager,
    dbService: GlobalDatabaseService
): void {
    testGlobalDrizzleManager = drizzleManager;
    testGlobalDbService = dbService;
    testToolsInitialized = true;
}

/**
 * Reset the CLI's database instances (for test cleanup)
 * Clears all injected test database instances and resets initialization state
 */
export function resetDatabaseInstances(): void {
    testGlobalDrizzleManager = null;
    testGlobalDbService = null;
    testToolsInitialized = false;
}

/**
 * Get the current test database instances
 * Returns null values if no test instances have been set
 * 
 * @returns Object containing test database instances and initialization state
 */
export function getTestDatabaseInstances(): {
    drizzleManager: DrizzleDatabaseManager | null;
    dbService: GlobalDatabaseService | null;
    isInitialized: boolean;
} {
    return {
        drizzleManager: testGlobalDrizzleManager,
        dbService: testGlobalDbService,
        isInitialized: testToolsInitialized
    };
}

/**
 * Check if test database instances are currently active
 * 
 * @returns True if test instances are set and initialized
 */
export function hasTestDatabaseInstances(): boolean {
    return testToolsInitialized && testGlobalDrizzleManager !== null && testGlobalDbService !== null;
}
