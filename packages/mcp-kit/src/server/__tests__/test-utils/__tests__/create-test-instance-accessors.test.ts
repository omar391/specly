import { describe, expect, it } from 'vitest';
import { createTestInstanceAccessors } from '../create-test-instance-accessors.js';

interface SamplePayload {
    label: string;
}

describe('createTestInstanceAccessors', () => {
    it('manages lifecycle of shared test instances', () => {
        const accessors = createTestInstanceAccessors<SamplePayload>();

        expect(accessors.hasInstances()).toBe(false);
        expect(accessors.getInstances()).toEqual({ value: null, isInitialized: false });

        accessors.setInstances({ label: 'alpha' });
        expect(accessors.hasInstances()).toBe(true);
        expect(accessors.getInstances()).toEqual({ value: { label: 'alpha' }, isInitialized: true });

        accessors.resetInstances();
        expect(accessors.hasInstances()).toBe(false);
        expect(accessors.getInstances()).toEqual({ value: null, isInitialized: false });
    });
});
