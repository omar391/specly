import { createDatabaseTestAccessors } from './create-database-test-accessors.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import type { GlobalDatabaseService } from '../database/global-queries.js';

/**
 * Database Test Helpers
 * 
 * Provides utilities for injecting test database instances into the CLI
 * for testing purposes. These functions should only be used in test environments.
 */

const helpers = createDatabaseTestAccessors<DrizzleDatabaseManager, GlobalDatabaseService>();

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
    helpers.setInstances({ drizzleManager, dbService });
}

/**
 * Reset the CLI's database instances (for test cleanup)
 * Clears all injected test database instances and resets initialization state
 */
export function resetDatabaseInstances(): void {
    helpers.resetInstances();
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
    const state = helpers.getInstances();
    const { value, isInitialized } = state;

    return {
        drizzleManager: value?.drizzleManager ?? null,
        dbService: value?.dbService ?? null,
        isInitialized,
    };
}

/**
 * Check if test database instances are currently active
 * 
 * @returns True if test instances are set and initialized
 */
export function hasTestDatabaseInstances(): boolean {
    if (!helpers.hasInstances()) {
        return false;
    }

    const { value } = helpers.getInstances();
    return Boolean(value?.drizzleManager && value?.dbService);
}
