import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseCliArgs, displayHelp, validateCliOptions, isStdioMode } from '../utils/cli-parser.js';

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
      const options = parseCliArgs([]);
      
      expect(options.port).toBe(8989);
      expect(options.mode).toBe('http');
      expect(options.dev).toBe(false);
      expect(options.help).toBe(false);
      expect(options.killExisting).toBe(true);
    });

    it('should parse port with --port flag', () => {
      const options = parseCliArgs(['--port', '3000']);
      expect(options.port).toBe(3000);
    });

    it('should parse port with -p short flag', () => {
      const options = parseCliArgs(['-p', '4000']);
      expect(options.port).toBe(4000);
    });

    it('should parse port with --port=value format', () => {
      const options = parseCliArgs(['--port=5000']);
      expect(options.port).toBe(5000);
    });

    it('should parse stdio mode', () => {
      const options = parseCliArgs(['--stdio']);
      expect(options.mode).toBe('stdio');
    });

    it('should parse http mode', () => {
      const options = parseCliArgs(['--http']);
      expect(options.mode).toBe('http');
    });

    it('should parse dev mode', () => {
      const options = parseCliArgs(['--dev']);
      expect(options.dev).toBe(true);
    });

    it('should parse help flag', () => {
      const options = parseCliArgs(['--help']);
      expect(options.help).toBe(true);
    });

    it('should parse -h short help flag', () => {
      const options = parseCliArgs(['-h']);
      expect(options.help).toBe(true);
    });

    it('should parse force-seed flag', () => {
      const options = parseCliArgs(['--force-seed']);
      expect(options.forceSeed).toBe(true);
    });

    it('should parse no-kill flag', () => {
      const options = parseCliArgs(['--no-kill']);
      expect(options.killExisting).toBe(false);
    });

    it('should handle multiple flags together', () => {
      const options = parseCliArgs(['--port', '9000', '--dev', '--no-kill']);
      
      expect(options.port).toBe(9000);
      expect(options.dev).toBe(true);
      expect(options.killExisting).toBe(false);
    });

    it('should throw on invalid port number', () => {
      expect(() => parseCliArgs(['--port', 'invalid'])).toThrow(/Invalid port number/);
    });

    it('should throw on port out of range', () => {
      expect(() => parseCliArgs(['--port', '99999'])).toThrow(/Invalid port number/);
    });

    it('should throw on unknown option', () => {
      expect(() => parseCliArgs(['--unknown-flag'])).toThrow(/Unknown option/);
    });

    it('should throw when --port has no value', () => {
      expect(() => parseCliArgs(['--port'])).toThrow(/--port requires a port number/);
    });

    it('should handle legacy --sse flag', () => {
      const options = parseCliArgs(['--sse']);
      expect(options.mode).toBe('http');
    });

    it('should respect SPECLY_FORCE_SEED env variable', () => {
      process.env.SPECLY_FORCE_SEED = '1';
      const options = parseCliArgs([]);
      
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
        dev: false,
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
        dev: false,
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
        dev: false,
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
        dev: false,
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
      
      displayHelp();
      
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
      const options = parseCliArgs([]);
      expect(options).toBeDefined();
      expect(options.port).toBe(8989);
    });

    it('should handle args with mixed formats', () => {
      const options = parseCliArgs([
        '--port=7000',
        '--dev',
        '-h'
      ]);
      
      expect(options.port).toBe(7000);
      expect(options.dev).toBe(true);
      expect(options.help).toBe(true);
    });

    it('should handle port at boundary values', () => {
      const options1 = parseCliArgs(['--port', '1']);
      expect(options1.port).toBe(1);
      
      const options2 = parseCliArgs(['--port', '65535']);
      expect(options2.port).toBe(65535);
    });

    it('should handle negative port numbers', () => {
      expect(() => parseCliArgs(['--port', '-100'])).toThrow('--port requires a port number');
    });

    it('should handle non-numeric port', () => {
      expect(() => parseCliArgs(['--port', 'abc'])).toThrow(/Invalid port number/);
    });

    it('should ignore non-flag arguments', () => {
      const options = parseCliArgs(['somearg', '--port', '3000']);
      expect(options.port).toBe(3000);
    });
  });
});
