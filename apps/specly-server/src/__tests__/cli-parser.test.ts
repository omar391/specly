import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseCliArgs, displayHelp, validateCliOptions, isStdioMode, type BaseCliOptions } from '@omar391/mcp-kit/utils/cli-parser';

type TestOptions = BaseCliOptions & { forceSeed: boolean };

const testConfig = {
  customOptionsParser: (args: string[], options: TestOptions) => {
    const forceSeed = args.includes('--force-seed') || process.env.SPECLY_FORCE_SEED === '1';
    return { ...options, forceSeed };
  }
};

describe('CLI Parser', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalArgv = process.argv;
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
  });

  describe('parseCliArgs', () => {
    it('should parse default options', () => {
      const options = parseCliArgs<TestOptions>([], testConfig);
      
      expect(options.port).toBe(8989);
      expect(options.mode).toBe('http');
      expect(options.local).toBe(false);
      expect(options.help).toBe(false);
      expect(options.killExisting).toBe(true);
      expect(options.forceSeed).toBe(false);
    });

    it('should parse port with --port flag', () => {
      const options = parseCliArgs<TestOptions>(['--port', '3000'], testConfig);
      expect(options.port).toBe(3000);
    });

    it('should parse port with -p short flag', () => {
      const options = parseCliArgs<TestOptions>(['-p', '4000'], testConfig);
      expect(options.port).toBe(4000);
    });

    it('should parse port with --port=value format', () => {
      const options = parseCliArgs<TestOptions>(['--port=5000'], testConfig);
      expect(options.port).toBe(5000);
    });

    it('should parse stdio mode', () => {
      const options = parseCliArgs<TestOptions>(['--stdio'], testConfig);
      expect(options.mode).toBe('stdio');
    });

    it('should parse http mode', () => {
      const options = parseCliArgs<TestOptions>(['--http'], testConfig);
      expect(options.mode).toBe('http');
    });

    it('should parse local mode', () => {
      const options = parseCliArgs<TestOptions>(['--local'], testConfig);
      expect(options.local).toBe(true);
    });

    it('should parse help flag', () => {
      const options = parseCliArgs<TestOptions>(['--help'], testConfig);
      expect(options.help).toBe(true);
    });

    it('should parse -h short help flag', () => {
      const options = parseCliArgs<TestOptions>(['-h'], testConfig);
      expect(options.help).toBe(true);
    });

    it('should parse no-kill flag', () => {
      const options = parseCliArgs<TestOptions>(['--no-kill'], testConfig);
      expect(options.killExisting).toBe(false);
    });

    it('should handle multiple flags together', () => {
      const options = parseCliArgs<TestOptions>(['--port', '9000', '--local', '--no-kill'], testConfig);
      
      expect(options.port).toBe(9000);
      expect(options.local).toBe(true);
      expect(options.killExisting).toBe(false);
    });

    it('should throw on invalid port number', () => {
      expect(() => parseCliArgs<TestOptions>(['--port', 'invalid'], testConfig)).toThrow(/Invalid port number/);
    });

    it('should throw on port out of range', () => {
      expect(() => parseCliArgs<TestOptions>(['--port', '99999'], testConfig)).toThrow(/Invalid port number/);
    });

    it('should throw on unknown option', () => {
      expect(() => parseCliArgs<TestOptions>(['--unknown-flag'], testConfig)).toThrow(/Unknown option/);
    });

    it('should throw when --port has no value', () => {
      expect(() => parseCliArgs<TestOptions>(['--port'], testConfig)).toThrow(/--port requires a port number/);
    });

    it('should handle legacy --sse flag', () => {
      const options = parseCliArgs<TestOptions>(['--sse'], testConfig);
      expect(options.mode).toBe('http');
    });

    it('should respect SPECLY_FORCE_SEED env variable', () => {
      process.env.SPECLY_FORCE_SEED = '1';
      const options = parseCliArgs<TestOptions>([], testConfig);
      
      expect(options.forceSeed).toBe(true);
    });
  });

  describe('isStdioMode', () => {
    it('should detect stdio mode from --stdio flag', () => {
      process.argv = ['node', 'script.js', '--stdio'];
      expect(isStdioMode()).toBe(true);
    });

    it('should detect stdio mode from STDIO_MODE env', () => {
      process.env.STDIO_MODE = '1';
      expect(isStdioMode()).toBe(true);
    });

    it('should return false when not in stdio mode', () => {
      process.argv = ['node', 'script.js'];
      delete process.env.STDIO_MODE;
      expect(isStdioMode()).toBe(false);
    });
  });

  describe('validateCliOptions', () => {
    it('should accept valid options', () => {
      const options = {
        port: 8989,
        mode: 'http' as const,
        local: false,
        help: false,
        killExisting: true,
        forceSeed: false
      };
      
      expect(() => validateCliOptions(options)).not.toThrow();
    });

    it('should throw on port below 1', () => {
      const options = {
        port: 0,
        mode: 'http' as const,
        local: false,
        help: false,
        killExisting: true,
        forceSeed: false
      };
      
      expect(() => validateCliOptions(options)).toThrow(/Port must be between/);
    });

    it('should throw on port above 65535', () => {
      const options = {
        port: 70000,
        mode: 'http' as const,
        local: false,
        help: false,
        killExisting: true,
        forceSeed: false
      };
      
      expect(() => validateCliOptions(options)).toThrow(/Port must be between/);
    });

    it('should throw on invalid mode', () => {
      const options = {
        port: 8989,
        mode: 'invalid' as any,
        local: false,
        help: false,
        killExisting: true,
        forceSeed: false
      };
      
      expect(() => validateCliOptions(options)).toThrow(/Mode must be/);
    });
  });

  describe('displayHelp', () => {
    it('should display help text', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      displayHelp({
        appName: 'specly',
        appDescription: 'Specly MCP Server',
      });
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.join('\n');
      
      expect(output).toContain('Specly');
      expect(output).toContain('USAGE');
      expect(output).toContain('OPTIONS');
      expect(output).toContain('--port');
      expect(output).toContain('--stdio');
      expect(output).toContain('--http');
      
      consoleLogSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty args array', () => {
      const options = parseCliArgs<TestOptions>([], testConfig);
      expect(options).toBeDefined();
      expect(options.port).toBe(8989);
    });

    it('should handle args with mixed formats', () => {
      const options = parseCliArgs<TestOptions>([
        '--port=7000',
        '--local',
        '-h'
      ], testConfig);
      
      expect(options.port).toBe(7000);
      expect(options.local).toBe(true);
      expect(options.help).toBe(true);
    });

    it('should handle port at boundary values', () => {
      const options1 = parseCliArgs<TestOptions>(['--port', '1'], testConfig);
      expect(options1.port).toBe(1);
      
      const options2 = parseCliArgs<TestOptions>(['--port', '65535'], testConfig);
      expect(options2.port).toBe(65535);
    });

    it('should handle negative port numbers', () => {
      expect(() => parseCliArgs<TestOptions>(['--port', '-100'], testConfig)).toThrow('--port requires a port number');
    });

    it('should handle non-numeric port', () => {
      expect(() => parseCliArgs<TestOptions>(['--port', 'abc'], testConfig)).toThrow(/Invalid port number/);
    });

    it('should ignore non-flag arguments', () => {
      const options = parseCliArgs<TestOptions>(['somearg', '--port', '3000'], testConfig);
      expect(options.port).toBe(3000);
    });
  });
});
