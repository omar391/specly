import { vi, describe, it, expect } from 'vitest';
import { exitProcess } from '../../scripts/exit-helper.js';

describe('exit-helper', () => {
    it('calls process.exit with given code', () => {
        const spy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called'); });
        try {
            expect(() => exitProcess(123)).toThrow('process.exit called');
            expect(spy).toHaveBeenCalledWith(123);
        } finally {
            spy.mockRestore();
        }
    });
});
