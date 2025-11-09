import { describe, it, expect } from 'vitest';
import { parseCliArgs, type BaseCliOptions } from '../cli-parser.js';

type ExtendedCliOptions = BaseCliOptions & { forceSeed: boolean; label?: string };

describe('parseCliArgs custom flag handlers', () => {
    it('applies boolean custom flag handler', () => {
        let forceSeed = false;

        const options = parseCliArgs<ExtendedCliOptions>(['--force-seed'], {
            defaultPort: 3000,
            customFlagHandlers: {
                '--force-seed': () => {
                    forceSeed = true;
                },
            },
            customOptionsParser: (_args, opts) => ({ ...opts, forceSeed } as ExtendedCliOptions),
        });

        expect(options.forceSeed).toBe(true);
        expect(options.port).toBe(3000);
    });

    it('allows handlers to consume values when requested', () => {
        let label = '';

        const options = parseCliArgs<ExtendedCliOptions>(['--label', 'hello'], {
            customFlagHandlers: {
                '--label': ({ args, index }) => {
                    label = args[index + 1] ?? '';
                    return 1;
                },
            },
            customOptionsParser: (_args, opts) => ({ ...opts, forceSeed: false, label } as ExtendedCliOptions),
        });

        expect(options.label).toBe('hello');
    });

    it('throws on unknown options without handler', () => {
        expect(() => parseCliArgs(['--unknown'])).toThrow(/Unknown option/);
    });
});
