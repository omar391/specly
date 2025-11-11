/**
 * Generic CLI Parser for MCP Servers
 * 
 * Extensible command line argument parsing for MCP server applications
 */

export interface BaseCliOptions {
    port: number;
    mode: 'http' | 'stdio';
    local: boolean;
    help: boolean;
    killExisting: boolean;
}

export interface FlagHandlerContext<T extends BaseCliOptions = BaseCliOptions> {
    args: string[];
    index: number;
    options: T;
}

export type CustomFlagHandler<T extends BaseCliOptions = BaseCliOptions> = (
    context: FlagHandlerContext<T>
) => number | void;

export interface CliParserConfig<T extends BaseCliOptions = BaseCliOptions> {
    /** Default port number */
    defaultPort?: number;
    /** Default mode */
    defaultMode?: 'http' | 'stdio';
    /** Application name for help text */
    appName?: string;
    /** Application description */
    appDescription?: string;
    /** Custom options parser */
    customOptionsParser?: (args: string[], options: T) => T;
    /** Custom help text */
    customHelpText?: string;
    /** Custom flag handlers for application-specific options */
    customFlagHandlers?: Record<string, CustomFlagHandler<T>>;
}

const runtimeProcess: NodeJS.Process = (() => {
    if (typeof globalThis !== 'undefined' && typeof (globalThis as any).process !== 'undefined') {
        return (globalThis as any).process as NodeJS.Process;
    }

    if (typeof process !== 'undefined') {
        return process as NodeJS.Process;
    }

    // Minimal fallback for non-Node environments
    return {
        argv: [],
        env: {},
    } as unknown as NodeJS.Process;
})();

/**
 * Returns true if running in stdio mode (either --stdio in argv or STDIO_MODE env set)
 */
export function isStdioMode(): boolean {
    return runtimeProcess.argv.includes('--stdio') || runtimeProcess.env.STDIO_MODE === '1';
}

/**
 * Generic CLI parser with extensibility for app-specific options
 */
export function parseCliArgs<T extends BaseCliOptions = BaseCliOptions>(
    args: string[] = runtimeProcess.argv.slice(2),
    config: CliParserConfig<T> = {}
): T {
    const options = {
        port: config.defaultPort ?? 8989,
        mode: config.defaultMode ?? 'http',
        local: false,
        help: false,
        killExisting: true,
    } as T;

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
                    (options as any).port = portNum;
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
                        (options as any).port = port;
                        i++; // Skip next arg since we consumed it
                    } else {
                        throw new Error(`Invalid port number: ${portArg}`);
                    }
                } else {
                    throw new Error('--port requires a port number');
                }
                break;

            case '--stdio':
                (options as any).mode = 'stdio';
                break;

            case '--http':
                (options as any).mode = 'http';
                break;

            case '--local':
                (options as any).local = true;
                break;

            case '--help':
            case '-h':
                (options as any).help = true;
                break;

            case '--no-kill':
                (options as any).killExisting = false;
                break;

            // Legacy compatibility
            case '--sse':
                (options as any).mode = 'http';
                break;

            default:
                const handler = config.customFlagHandlers?.[arg];
                if (handler) {
                    const consumed = handler({ args, index: i, options });
                    if (typeof consumed === 'number' && consumed > 0) {
                        i += consumed;
                    }
                    break;
                }
                if (arg.startsWith('-')) {
                    throw new Error(`Unknown option: ${arg}`);
                }
                break;
        }
    }

    // Allow custom parser to extend/modify options
    if (config.customOptionsParser) {
        return config.customOptionsParser(args, options);
    }

    return options;
}

/**
 * Display generic help text with optional customization
 */
export function displayHelp(config: CliParserConfig = {}): void {
    const appName = config.appName ?? 'MCP Server';
    const appDescription = config.appDescription ?? 'Model Context Protocol Server';
    const defaultPort = config.defaultPort ?? 8989;

    console.log(`
${appDescription}

USAGE:
  ${appName.toLowerCase().replace(/\s+/g, '-')} [OPTIONS]

OPTIONS:
  --port, -p <number>    Port number to run on (default: ${defaultPort})
  --stdio               Run in STDIO mode for MCP clients
  --http                Run in HTTP mode (default)
  --local               Enable local features like instance manager and control endpoints
  --no-kill             Don't kill existing instances on the port
  --help, -h            Show this help message

EXAMPLES:
  ${appName.toLowerCase().replace(/\s+/g, '-')}                          # Start on port ${defaultPort}
  ${appName.toLowerCase().replace(/\s+/g, '-')} --port 3000              # Start on port 3000
  ${appName.toLowerCase().replace(/\s+/g, '-')} --stdio                  # Start in STDIO mode for MCP
  ${appName.toLowerCase().replace(/\s+/g, '-')} --local --port 3001      # Local mode on port 3001

MODES:
  HTTP Mode (default):
    - MCP via Server-Sent Events at http://localhost:<port>/mcp
    - Optional REST API and UI can be added by the application
    
  STDIO Mode:
    - Compatible with MCP clients that expect STDIO transport
    - No HTTP endpoints
${config.customHelpText ? '\n' + config.customHelpText : ''}
`);
}

/**
 * Validate CLI options
 */
export function validateCliOptions(options: BaseCliOptions): void {
    if (options.port < 1 || options.port > 65535) {
        throw new Error(`Port must be between 1 and 65535, got: ${options.port}`);
    }

    if (options.mode !== 'http' && options.mode !== 'stdio') {
        throw new Error(`Mode must be 'http' or 'stdio', got: ${options.mode}`);
    }
}
