/**
 * Process Management Utilities
 * 
 * Generic process signal handling and graceful shutdown
 */

/**
 * Create a graceful shutdown handler
 */
export function createShutdownHandler(serverName: string = 'MCP Server'): (signal: string) => void {
    return (signal: string) => {
        console.log(`\n${signal} received. Shutting down ${serverName} gracefully...`);

        // Give time for cleanup
        setTimeout(() => {
            console.log(`${serverName} shutdown complete.`);
            process.exit(0);
        }, 1000);
    };
}

/**
 * Register standard process signal handlers
 */
export function registerSignalHandlers(serverName: string = 'MCP Server'): void {
    const handler = createShutdownHandler(serverName);

    process.on('SIGINT', () => handler('SIGINT'));
    process.on('SIGTERM', () => handler('SIGTERM'));
    process.on('SIGUSR1', () => handler('SIGUSR1'));
    process.on('SIGUSR2', () => handler('SIGUSR2'));

    // Handle uncaught exceptions gracefully
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        console.log('Shutting down due to uncaught exception...');
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        console.log('Shutting down due to unhandled rejection...');
        process.exit(1);
    });
}
