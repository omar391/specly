import { describe, it, expect, beforeEach } from 'vitest';
import {
  setTestDatabaseInstances,
  resetDatabaseInstances,
  getTestDatabaseInstances,
  hasTestDatabaseInstances
} from '../test-utils/database-test-helpers.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import type { GlobalDatabaseService } from '../database/global-queries.js';

describe('Database Test Helpers', () => {
  // Create mock instances for testing
  const mockDrizzleManager = {
    global: { query: {} },
    workspace: { query: {} }
  } as unknown as DrizzleDatabaseManager;

  const mockDbService = {
    getWorkspaceByPath: async () => null
  } as unknown as GlobalDatabaseService;

  beforeEach(() => {
    // Reset state before each test
    resetDatabaseInstances();
  });

  describe('setTestDatabaseInstances', () => {
    it('should set drizzle manager and db service', () => {
      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      
      const instances = getTestDatabaseInstances();
      expect(instances.drizzleManager).toBe(mockDrizzleManager);
      expect(instances.dbService).toBe(mockDbService);
    });

    it('should set isInitialized to true', () => {
      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      
      const instances = getTestDatabaseInstances();
      expect(instances.isInitialized).toBe(true);
    });

    it('should allow updating instances with new values', () => {
      const newDrizzleManager = {
        global: { query: {} }
      } as unknown as DrizzleDatabaseManager;
      const newDbService = {
        getWorkspaceByPath: async () => ({ id: 1 })
      } as unknown as GlobalDatabaseService;

      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      setTestDatabaseInstances(newDrizzleManager, newDbService);
      
      const instances = getTestDatabaseInstances();
      expect(instances.drizzleManager).toBe(newDrizzleManager);
      expect(instances.dbService).toBe(newDbService);
    });
  });

  describe('resetDatabaseInstances', () => {
    it('should clear drizzle manager', () => {
      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      resetDatabaseInstances();
      
      const instances = getTestDatabaseInstances();
      expect(instances.drizzleManager).toBeNull();
    });

    it('should clear db service', () => {
      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      resetDatabaseInstances();
      
      const instances = getTestDatabaseInstances();
      expect(instances.dbService).toBeNull();
    });

    it('should set isInitialized to false', () => {
      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      resetDatabaseInstances();
      
      const instances = getTestDatabaseInstances();
      expect(instances.isInitialized).toBe(false);
    });

    it('should be idempotent', () => {
      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      resetDatabaseInstances();
      resetDatabaseInstances();
      
      const instances = getTestDatabaseInstances();
      expect(instances.drizzleManager).toBeNull();
      expect(instances.dbService).toBeNull();
      expect(instances.isInitialized).toBe(false);
    });
  });

  describe('getTestDatabaseInstances', () => {
    it('should return null values when not initialized', () => {
      const instances = getTestDatabaseInstances();
      
      expect(instances.drizzleManager).toBeNull();
      expect(instances.dbService).toBeNull();
      expect(instances.isInitialized).toBe(false);
    });

    it('should return set instances when initialized', () => {
      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      const instances = getTestDatabaseInstances();
      
      expect(instances.drizzleManager).toBe(mockDrizzleManager);
      expect(instances.dbService).toBe(mockDbService);
      expect(instances.isInitialized).toBe(true);
    });

    it('should return object with all three properties', () => {
      const instances = getTestDatabaseInstances();
      
      expect(instances).toHaveProperty('drizzleManager');
      expect(instances).toHaveProperty('dbService');
      expect(instances).toHaveProperty('isInitialized');
    });

    it('should reflect state after reset', () => {
      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      resetDatabaseInstances();
      const instances = getTestDatabaseInstances();
      
      expect(instances.drizzleManager).toBeNull();
      expect(instances.dbService).toBeNull();
      expect(instances.isInitialized).toBe(false);
    });
  });

  describe('hasTestDatabaseInstances', () => {
    it('should return false when not initialized', () => {
      expect(hasTestDatabaseInstances()).toBe(false);
    });

    it('should return true when instances are set', () => {
      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      expect(hasTestDatabaseInstances()).toBe(true);
    });

    it('should return false after reset', () => {
      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      resetDatabaseInstances();
      expect(hasTestDatabaseInstances()).toBe(false);
    });

    it('should check all three conditions (initialized, drizzle, service)', () => {
      // This is implicitly tested by the implementation requiring:
      // testToolsInitialized && testGlobalDrizzleManager !== null && testGlobalDbService !== null
      
      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      expect(hasTestDatabaseInstances()).toBe(true);
      
      // After reset, all conditions fail
      resetDatabaseInstances();
      expect(hasTestDatabaseInstances()).toBe(false);
    });
  });

  describe('State isolation between tests', () => {
    it('should not leak state from previous test', () => {
      // This test validates that beforeEach properly resets state
      const instances = getTestDatabaseInstances();
      expect(instances.drizzleManager).toBeNull();
      expect(instances.dbService).toBeNull();
      expect(instances.isInitialized).toBe(false);
    });

    it('should maintain state within a test', () => {
      setTestDatabaseInstances(mockDrizzleManager, mockDbService);
      
      const instances1 = getTestDatabaseInstances();
      const instances2 = getTestDatabaseInstances();
      
      expect(instances1.drizzleManager).toBe(instances2.drizzleManager);
      expect(instances1.dbService).toBe(instances2.dbService);
      expect(instances1.isInitialized).toBe(instances2.isInitialized);
    });
  });
});
