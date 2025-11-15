import { describe, it, expect } from 'vitest';
import * as schema from '../global-schema';
import {
    workspaces,
    specs,
    profileVersions,
    tools,
    toolVersions,
    __ref_workspaces_id,
    __ref_specs_hash,
    __ref_profileVersions_id,
    __ref_tools_name,
    __ref_toolVersions_hash,
} from '../global-schema';

describe('global-schema', () => {
    it('exports expected table definitions', () => {
        expect(schema).toBeTruthy();
        expect(schema.workspaces).toBeDefined();
        expect(schema.sessions).toBeDefined();
        expect(schema.specs).toBeDefined();
        expect(schema.tools).toBeDefined();
        expect(schema.profiles).toBeDefined();
    });

    it('table exports are objects (drizzle definitions)', () => {
        const tableKeys = ['workspaces', 'sessions', 'specs', 'tools', 'profiles'];
        for (const k of tableKeys) {
            // runtime: the sqliteTable call returns an object describing the table
            expect(typeof (schema as any)[k]).toBe('object');
            expect((schema as any)[k]).not.toBeNull();
        }
    });

    it('resolver helpers are callable and return expected columns', () => {
    // Check helpers are functions
        expect(typeof __ref_workspaces_id).toBe('function');
        expect(typeof __ref_profileVersions_id).toBe('function');
        expect(typeof __ref_tools_name).toBe('function');
        expect(typeof __ref_toolVersions_hash).toBe('function');
        expect(typeof __ref_specs_hash).toBe('function');

        // Each helper should return the same column object exported on the table
        expect(__ref_workspaces_id()).toBe(workspaces.id);
        expect(__ref_specs_hash()).toBe(specs.hash);
        expect(__ref_profileVersions_id()).toBe(profileVersions.id);
        expect(__ref_tools_name()).toBe(tools.name);
        expect(__ref_toolVersions_hash()).toBe(toolVersions.hash);
    });
});
