#!/usr/bin/env node
/**
 * Specly Seed Script
 * ---------------------------------------
 * Idempotently seeds the Specly baseline data (specs, tools, root profile,
 * workspace bindings). Safe to run multiple times; only missing entities
 * are created. Provides both a machine-readable one-line JSON summary log
 * (event: "specly_seed_summary") and an optional pretty JSON output when
 * --pretty is passed.
 *
 * Exit Codes:
 *  0 - Success
 *  1 - Failure (error logged to stderr)
 */
import { initializeGlobalDatabaseService } from '../database/global-queries.js';
import { SeedManager } from '../services/seed-manager.js';

interface SeedSummaryLog {
    event: 'specly_seed_summary';
    timestamp: string;
    specsCreated: number;
    toolVersionsCreated: number;
    profileCreated: boolean;
    profileVersionsCreated: number;
    toolsAttached: number;
    workspaceBindings: number;
    createdSpecHashes: string[];
    createdToolVersionHashes: string[];
}

export async function main() {
    try {
        const pretty = process.argv.includes('--pretty');
        const globalDb = await initializeGlobalDatabaseService();
        const drizzleManager = globalDb.getDrizzleManager();
        const seedManager = new SeedManager(drizzleManager as any);
        await seedManager.initializeGlobalData();
        const result = await seedManager.seedSpecly();

        const summary: SeedSummaryLog = {
            event: 'specly_seed_summary',
            timestamp: new Date().toISOString(),
            ...result
        };

        // Emit deterministic one-line JSON for log aggregation
        console.log(JSON.stringify(summary));

        if (pretty) {
            // Provide a human-friendly expanded representation (separate line)
            // Intentionally not merging with the summary line above.
            console.log('\n' + JSON.stringify({ ok: true, ...result }, null, 2));
        }
    } catch (err) {
        console.error('Seed failed', err);
        process.exit(1);
    }
}

// Keep CLI behavior: run when executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('seed-specly.ts') || process.argv[1].endsWith('seed-specly.js')) {
    main().catch(err => {
        console.error('Seed failed', err);
        process.exit(1);
    });
}
