import { defineConfig } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = process.env.BUILD_TARGET || 'universal';

const universalEntries = {
    'server/core/hono-mcp': './src/server/core/hono-mcp.ts',
    'server/core/types': './src/server/core/types.ts',
    'server/core/middleware': './src/server/core/middleware.ts',
    'server/core/runtime': './src/server/core/runtime.ts',
    'server/handlers': './src/server/handlers.ts',
    'utils/cli-parser': './src/utils/cli-parser.ts',
};

const localEntries = {
    'index': './src/index.ts',
    'client': './src/client.ts',
    'server/index': './src/server/index.ts',
    'server/stdio': './src/server/stdio.ts',
    'server/server-starter': './src/server/server-starter.ts',
    'server/hono-starter': './src/server/hono-starter.ts',
    'server/local/node-instance': './src/server/local/node-instance/index.ts',
    'server/local/port-manager': './src/server/local/port-manager.ts',
};

const entries = target === 'node' ? { ...universalEntries, ...localEntries } : universalEntries;

export default defineConfig({
    plugins: [pluginNodePolyfill()],
    output: {
        distPath: { root: path.join('dist', target) },
        minify: false,
        target: target === 'node' ? 'node' : 'web',
    },
    source: {
        entry: entries,
    },
    tools: {
        rspack: (config) => {
            // Set JS target
            config.target = target === 'node' ? 'node18' : 'es2020';

            config.output.filename = '[name].js';
            config.output.chunkFormat = 'module';

            if (target === 'node') {
                // For node target, output clean ES modules without library wrapper
                config.output.library = { type: 'module' };
                config.output.module = true;
                config.experiments = {
                    ...config.experiments,
                    outputModule: true,
                };
            } else if (target === 'universal') {
                // For universal target, output clean ES modules without library wrapper
                config.output.library = { type: 'module' };
                config.output.module = true;
                config.experiments = {
                    ...config.experiments,
                    outputModule: true,
                };
            } else {
                config.output.library = {
                    type: 'module',
                };
            }

            // Ensure Node externals are not bundled
            config.externalsType = 'module';
            if (target === 'universal') {
                config.externals = [/^@modelcontextprotocol\/sdk$/, /^hono$/];
            } else {
                config.externals = [/^@modelcontextprotocol\/sdk$/];
            }

            // Disable chunk splitting to prevent dynamic imports
            config.optimization = {
                ...config.optimization,
                splitChunks: false,
            };
        },
    },
});
