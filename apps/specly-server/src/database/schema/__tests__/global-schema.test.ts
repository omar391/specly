import { describe, it, expect } from 'vitest';
import * as schema from '../global-schema';
import {
    __ref_workspaces_id,
    __ref_profileVersions_id,
    __ref_tools_name,
    __ref_toolVersions_hash,
    __ref_specs_hash
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

    it('resolver helpers are callable', () => {
        // Call the exported resolver helpers to exercise the inline callbacks
        expect(typeof __ref_workspaces_id).toBe('function');
        expect(typeof __ref_profileVersions_id).toBe('function');
        expect(typeof __ref_tools_name).toBe('function');
        expect(typeof __ref_toolVersions_hash).toBe('function');
        expect(typeof __ref_specs_hash).toBe('function');

        // Call them to make sure they're executed without throwing
        __ref_workspaces_id();
        __ref_profileVersions_id();
        __ref_tools_name();
        __ref_toolVersions_hash();
        __ref_specs_hash();
    });
});
