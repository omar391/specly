import { defineConfig } from '@rsbuild/core';

export default defineConfig({
    source: {
        entry: {
            index: './src/index.ts',
        },
    },
    output: {
        target: 'node',
        distPath: {
            root: 'dist',
        },
        filename: {
            js: '[name].js',
        },
        cleanDistPath: true,
    },
    resolve: {
        alias: {
            '@': './src',
        },
    },
    tools: {
        rspack: {
            target: 'node18',
            output: {
                module: true,
                chunkFormat: 'module',
                library: {
                    type: 'module',
                },
            },
            experiments: {
                outputModule: true,
            },
            externalsType: 'module',
            externals: {
                'better-sqlite3': 'better-sqlite3',
                'sqlite3': 'sqlite3',
            },
            node: {
                __dirname: false,
                __filename: false,
            },
        },
    },
    mode: 'production',
});
