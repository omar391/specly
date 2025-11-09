/**
 * Specly CLI Parser
 *
 * Extends generic mcp-kit CLI parser with Specly-specific options
 */

import {
  parseCliArgs as parseGenericCliArgs,
  displayHelp as displayGenericHelp,
  validateCliOptions as validateGenericCliOptions,
  isStdioMode as genericIsStdioMode,
  type BaseCliOptions,
} from '@omar391/mcp-kit/utils/cli-parser';

/**
 * Returns true if running in stdio mode (either --stdio in argv or STDIO_MODE env set)
 */
export function isStdioMode(): boolean {
  return genericIsStdioMode();
}

export interface CliOptions extends BaseCliOptions {
  forceSeed: boolean;
}

/**
 * Parse command line arguments for Specly
 */
export function parseCliArgs(args: string[] = process.argv.slice(2)): CliOptions {
  // Pre-process Specly-specific options and filter them out
  let forceSeed = process.env.SPECLY_FORCE_SEED === '1';

  // Parse base options with custom flag handler for Specly-specific flags
  const baseOptions = parseGenericCliArgs<BaseCliOptions>(args, {
    defaultPort: 8989,
    defaultMode: 'http',
    appName: 'Specly',
    appDescription: 'Specly MCP Server',
    customFlagHandlers: {
      '--force-seed': () => {
        forceSeed = true;
      },
    },
  });

  // Extend with Specly-specific options
  return {
    ...baseOptions,
    forceSeed
  };
}

/**
 * Display help text for Specly
 */
export function displayHelp(): void {
  displayGenericHelp({
    defaultPort: 8989,
    appName: 'Specly',
    appDescription: 'Specly MCP Server',
    customHelpText: `
SPECLY-SPECIFIC OPTIONS:
  --force-seed          Force re-run of Specly seeding even if data present
                        (or set SPECLY_FORCE_SEED=1)

HTTP MODE ENDPOINTS:
  - Serves UI at http://localhost:<port>/
  - REST API at http://localhost:<port>/api/
  - MCP via Server-Sent Events at http://localhost:<port>/mcp
`
  });
}

/**
 * Validate Specly CLI options
 */
export function validateCliOptions(options: CliOptions): void {
  validateGenericCliOptions(options);
  // Add any Specly-specific validation here if needed
}