/**
 * Command Line Interface Parser
 *
 * Handles command line arguments for TaskPilot server
 */

/**
 * Returns true if running in stdio mode (either --stdio in argv or STDIO_MODE env set)
 */
export function isStdioMode(): boolean {
  return process.argv.includes('--stdio') || process.env.STDIO_MODE === '1';
}

export interface CliOptions {
  port: number;
  mode: 'http' | 'stdio';
  dev: boolean;
  help: boolean;
  killExisting: boolean;
  forceSeed: boolean;
}

/**
 * Parse command line arguments
 */
export function parseCliArgs(args: string[] = process.argv.slice(2)): CliOptions {
  const options: CliOptions = {
    port: 8989, // Default memorable port
    mode: 'http', // Default to integrated mode
    dev: false,
    help: false,
    killExisting: true,
    forceSeed: process.env.TASKPILOT_FORCE_SEED === '1'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle --option=value format
    if (arg.includes('=')) {
      const [option, value] = arg.split('=', 2);

      switch (option) {
        case '--port':
          const portNum = parseInt(value, 10);
          if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            throw new Error(`Invalid port number: ${value}. Port must be between 1 and 65535.`);
          }
          options.port = portNum;
          break;

        default:
          throw new Error(`Unknown option: ${option}`);
      }
      continue;
    }

    switch (arg) {
      case '--port':
      case '-p':
        const portArg = args[i + 1];
        if (portArg && !portArg.startsWith('-')) {
          const port = parseInt(portArg, 10);
          if (!isNaN(port) && port > 0 && port <= 65535) {
            options.port = port;
            i++; // Skip next arg since we consumed it
          } else {
            throw new Error(`Invalid port number: ${portArg}`);
          }
        } else {
          throw new Error('--port requires a port number');
        }
        break;

      case '--stdio':
        options.mode = 'stdio';
        break;

      case '--http':
        options.mode = 'http';
        break;

      case '--dev':
        options.dev = true;
        break;

      case '--force-seed':
        options.forceSeed = true;
        break;

      case '--help':
      case '-h':
        options.help = true;
        break;

      case '--no-kill':
        options.killExisting = false;
        break;

      // Legacy compatibility
      case '--sse':
        options.mode = 'http';
        break;

      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        break;
    }
  }

  return options;
}

/**
 * Display help text
 */
export function displayHelp(): void {
  console.log(`
TaskPilot MCP Server

USAGE:
  taskpilot [OPTIONS]

OPTIONS:
  --port, -p <number>    Port number to run on (default: 8989)
  --stdio               Run in STDIO mode for MCP clients
  --http                Run in HTTP mode with integrated UI (default)
  --dev                 Enable development mode
  --force-seed          Force re-run of Specly seeding even if data present (or TASKPILOT_FORCE_SEED=1)
  --no-kill             Don't kill existing TaskPilot instances
  --help, -h            Show this help message

EXAMPLES:
  taskpilot                          # Start on port 8989 with UI
  taskpilot --port 3000              # Start on port 3000
  taskpilot --stdio                  # Start in STDIO mode for MCP
  taskpilot --dev --port 3001        # Development mode on port 3001

MODES:
  HTTP Mode (default):
    - Serves UI at http://localhost:<port>/
    - REST API at http://localhost:<port>/api/
    - MCP via Server-Sent Events at http://localhost:<port>/mcp
    
  STDIO Mode:
    - Compatible with MCP clients that expect STDIO transport
    - No UI or HTTP endpoints
`);
}

/**
 * Validate CLI options
 */
export function validateCliOptions(options: CliOptions): void {
  if (options.port < 1 || options.port > 65535) {
    throw new Error(`Port must be between 1 and 65535, got: ${options.port}`);
  }

  if (options.mode !== 'http' && options.mode !== 'stdio') {
    throw new Error(`Mode must be 'http' or 'stdio', got: ${options.mode}`);
  }
}
