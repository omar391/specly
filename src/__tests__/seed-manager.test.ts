import { describe, it, expect, beforeAll } from 'vitest';
import { SeedManager } from '../services/seed-manager.js';
import { profiles, profileVersions, workspaces, workspaceProfileVersions } from '../database/schema/global-schema.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { SPECLY_SEED_SPECS, SPECLY_SEED_TOOLS } from '../data/embedded-seed-data.js';
import { eq } from 'drizzle-orm';

describe('SeedManager Specly seeding (SP-004)', () => {
    let seedManager: SeedManager;
    let db: any;
    beforeAll(async () => {
        // Use an isolated in-memory GLOBAL database so other test files don't pre-seed it
        const isolated = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        await isolated.initialize();
        db = isolated.getDb();
        seedManager = new SeedManager(isolated as any);
    });

    it('is idempotent (second run creates zero new)', async () => {
        const first = await seedManager.seedSpecly();
        const second = await seedManager.seedSpecly();
        // First run should create all seed specs & tool versions & a profile version
        expect(first.specsCreated).toBe(SPECLY_SEED_SPECS.length);
        expect(first.toolVersionsCreated).toBe(SPECLY_SEED_TOOLS.length);
        expect(first.profileCreated).toBe(true);
        expect(first.profileVersionsCreated).toBe(1);
        // Second run should be a no-op for creations
        expect(second.specsCreated).toBe(0);
        expect(second.toolVersionsCreated).toBe(0);
        expect(second.profileCreated).toBe(false);
        expect(second.profileVersionsCreated).toBe(0);
    });

    it('creates root profile version and binds workspaces (if any)', async () => {
        // Run seeding at least once (idempotent if already run by previous test)
        await seedManager.seedSpecly();
        const profileRows = await db.select().from(profiles).where(eq(profiles.name, 'root-profile'));
        expect(profileRows.length).toBe(1);
        const versions = await db.select().from(profileVersions).where(eq(profileVersions.profileId, profileRows[0].id));
        expect(versions.length).toBeGreaterThanOrEqual(1);
    });

    it('binds newly created workspace to existing root profile version on first seed after workspace creation', async () => {
        // Create a workspace AFTER initial seed so binding path is exercised separately
        const wsId = 'ws-test-1';
        await db.insert(workspaces).values({ id: wsId, path: '/tmp/ws-test-1', name: 'WS Test 1' });
        // Run seed again (should not recreate specs but should bind workspace if profile already exists)
        await seedManager.seedSpecly();
        const bindings = await db.select().from(workspaceProfileVersions).where(eq(workspaceProfileVersions.workspaceId, wsId));
        expect(bindings.length).toBe(1);
    });
});
