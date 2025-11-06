import { defineConfig } from '@rsbuild/core';

export default defineConfig({
    output: {
        distPath: { root: 'dist' },
        minify: false,
        target: 'node'
    },
    source: {
        entry: {
            index: './src/index.ts',
            client: './src/client.ts',
            // Stubs for future adapters
            'http/index': './src/http/index.ts',
            'express/index': './src/express/index.ts',
            'server/index': './src/server/index.ts',
            'node-instance/index': './src/node-instance/index.ts'
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
        },
    },
});
