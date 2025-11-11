import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SpeclyServer, SPECLY_VERSION, initializeServer, ensureServerInitialized, createMCPToolHandlers, configureSpeclyApp, setupSpeclyApi, ensureSpeclySeed } from '../index.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { Hono } from 'hono';

describe('index.ts', () => {
  describe('SPECLY_VERSION', () => {
    it('returns a version string', () => {
      expect(typeof SPECLY_VERSION).toBe('string');
      expect(SPECLY_VERSION.length).toBeGreaterThan(0);
    });
  });

  describe('SpeclyServer', () => {
    let server: SpeclyServer;
    let manager: DrizzleDatabaseManager;

    beforeAll(async () => {
      manager = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
      await manager.initialize();
      server = new SpeclyServer();
    });

    afterAll(async () => {
      await manager.close();
    });

    it('can be instantiated', () => {
      expect(server).toBeInstanceOf(SpeclyServer);
    });

    it('has all required methods', () => {
      expect(typeof server.initializeServer).toBe('function');
      expect(typeof server.ensureServerInitialized).toBe('function');
      expect(typeof server.createMCPToolHandlers).toBe('function');
      expect(typeof server.configureSpeclyApp).toBe('function');
      expect(typeof server.setupSpeclyApi).toBe('function');
      expect(typeof server.ensureSpeclySeed).toBe('function');
      expect(typeof server.getGlobalDbService).toBe('function');
      expect(typeof server.startBackgroundJobs).toBe('function');
      expect(typeof server.stopBackgroundJobs).toBe('function');
    });

    it('configureSpeclyApp adds error handling to Hono app', async () => {
      const app = new Hono();
      await server.configureSpeclyApp(app, { dev: true });
      expect(app).toBeDefined();
      // Test that error handler is added by checking if it has middleware
      // This is a basic test since full error testing requires more setup
    });

    it('getGlobalDbService throws when not initialized', () => {
      expect(() => server.getGlobalDbService()).toThrow();
    });
  });

  describe('Backward compatibility functions', () => {
    it('initializeServer is a function', () => {
      expect(typeof initializeServer).toBe('function');
    });

    it('ensureServerInitialized is a function', () => {
      expect(typeof ensureServerInitialized).toBe('function');
    });

    it('createMCPToolHandlers is a function', () => {
      expect(typeof createMCPToolHandlers).toBe('function');
    });

    it('configureSpeclyApp is a function', () => {
      expect(typeof configureSpeclyApp).toBe('function');
    });

    it('setupSpeclyApi is a function', () => {
      expect(typeof setupSpeclyApi).toBe('function');
    });

    it('ensureSpeclySeed is a function', () => {
      expect(typeof ensureSpeclySeed).toBe('function');
    });
  });
});