import { defineConfig } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';

export default defineConfig({
    plugins: [pluginNodePolyfill()],
    output: {
        distPath: { root: 'dist' },
        minify: false,
        target: 'node',
    },
    source: {
        entry: {
            index: './src/index.ts',
            client: './src/client.ts',
            'server/index': './src/server/index.ts',
            'server/express/index': './src/server/express/index.ts',
            'server/handlers': './src/server/handlers.ts',
            'server/stdio': './src/server/stdio.ts',
            'server/core/hono-mcp': './src/server/core/hono-mcp.ts',
            'server/core/types': './src/server/core/types.ts',
            'server/core/middleware': './src/server/core/middleware.ts',
            'server/core/runtime': './src/server/core/runtime.ts',
            'utils/cli-parser': './src/utils/cli-parser.ts',
        },
    },
    tools: {
        rspack: (config) => {
            // Ensure Node externals are not bundled (sdk, express etc.)
            config.externalsType = 'module';
            (config.externals as any) = [
                /@modelcontextprotocol\/sdk/,
                /express/,
                /http-proxy/
            ];
            // Disable chunk splitting to prevent dynamic imports
            config.optimization = {
                ...config.optimization,
                splitChunks: false,
            };
        },
    },
});
