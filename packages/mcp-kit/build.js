import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Define build targets for different runtimes
const buildTargets = {
    // Universal core (works everywhere)
    universal: {
        platform: 'neutral',
        target: 'es2020',
        format: 'esm',
        external: ['@modelcontextprotocol/sdk', 'hono'],
        outdir: 'dist/universal'
    },
    // Node.js specific (includes Node.js APIs)
    node: {
        platform: 'node',
        target: 'node18',
        format: 'esm',
        external: ['@modelcontextprotocol/sdk', 'express', 'http-proxy'],
        outdir: 'dist/node'
    },
    // Browser/edge compatible
    browser: {
        platform: 'browser',
        target: 'es2020',
        format: 'esm',
        external: ['@modelcontextprotocol/sdk'],
        outdir: 'dist/browser'
    }
};

const entryPoints = {
    'index': './src/index.ts',
    'client': './src/client.ts',
    'server/index': './src/server/index.ts',
    'server/handlers': './src/server/handlers.ts',
    'server/stdio': './src/server/stdio.ts',
    'server/core/hono-mcp': './src/server/core/hono-mcp.ts',
    'server/core/types': './src/server/core/types.ts',
    'server/core/middleware': './src/server/core/middleware.ts',
    'server/core/runtime': './src/server/core/runtime.ts',
    'server/local/node-instance': './src/server/local/node-instance/index.ts',
    'server/local/port-manager': './src/server/local/port-manager.ts',
    'utils/cli-parser': './src/utils/cli-parser.ts',
};

// Separate universal vs local entries
const universalEntries = {
    'server/core/hono-mcp': './src/server/core/hono-mcp.ts',
    'server/core/types': './src/server/core/types.ts',
    'server/core/middleware': './src/server/core/middleware.ts',
    'server/core/runtime': './src/server/core/runtime.ts',
    'server/handlers': './src/server/handlers.ts',
    'server/__tests__/test-utils/create-test-instance-accessors': './src/server/__tests__/test-utils/create-test-instance-accessors.ts',
    'utils/cli-parser': './src/utils/cli-parser.ts',
};

const localEntries = {
    'index': './src/index.ts',
    'client': './src/client.ts',
    'server/index': './src/server/index.ts',
    'server/stdio': './src/server/stdio.ts',
    'server/local/node-instance': './src/server/local/node-instance/index.ts',
    'server/local/port-manager': './src/server/local/port-manager.ts',
};

async function buildTarget(name, config, entries) {
    console.log(`Building ${name} target...`);

    const buildPromises = Object.entries(entries).map(async ([entryName, entryPath]) => {
        const outFile = path.join(config.outdir, `${entryName}.js`);

        // Ensure output directory exists
        const outDir = path.dirname(outFile);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        return esbuild.build({
            entryPoints: [entryPath],
            outfile: outFile,
            bundle: true,
            platform: config.platform,
            target: config.target,
            format: config.format,
            external: config.external,
            sourcemap: false,
            minify: false,
            keepNames: true,
            define: {
                // Define environment variables for different targets
                'process.env.NODE_ENV': '"production"',
            },
        });
    });

    await Promise.all(buildPromises);
    console.log(`${name} target built successfully`);
}

async function build() {
    // Clean dist directory
    if (fs.existsSync('dist')) {
        fs.rmSync('dist', { recursive: true });
    }
    fs.mkdirSync('dist', { recursive: true });

    const { execSync } = await import('child_process');

    try {
        // Build universal target (works everywhere)
        await buildTarget('universal', buildTargets.universal, universalEntries);

        // Build Node.js target (includes Node.js APIs)
        await buildTarget('node', buildTargets.node, { ...universalEntries, ...localEntries });

        // Build browser target (minimal, no Node.js APIs)
        await buildTarget('browser', buildTargets.browser, universalEntries);

        // Copy universal builds to default dist for backwards compatibility
        console.log('Copying universal builds for backwards compatibility...');
        const universalDist = 'dist/universal';
        const defaultDist = 'dist';

        // Use cp command to recursively copy all files from universal to root dist
        execSync(`cp -r ${universalDist}/* ${defaultDist}/ 2>/dev/null || true`, { stdio: 'inherit' });

        // Generate TypeScript declarations
        console.log('Generating TypeScript declarations...');
        execSync('npx tsc -p tsconfig.json --emitDeclarationOnly --skipLibCheck', { stdio: 'inherit' });

        // Copy test-utils declarations from universal build
        console.log('Copying test-utils declarations...');
        execSync('cp dist/universal/server/__tests__/test-utils/create-test-instance-accessors.d.ts dist/server/__tests__/test-utils/ 2>/dev/null || true', { stdio: 'inherit' });

        // Copy declaration files to target directories
        console.log('Copying declaration files to target directories...');

        // Use cp command to copy declaration files to each target directory
        execSync('find dist -maxdepth 2 -name "*.d.ts" -o -name "*.d.ts.map" | grep -v "/node/" | grep -v "/browser/" | grep -v "/universal/" | xargs -I {} cp {} dist/node/ 2>/dev/null || true', { stdio: 'inherit' });
        execSync('find dist -maxdepth 2 -name "*.d.ts" -o -name "*.d.ts.map" | grep -v "/node/" | grep -v "/browser/" | grep -v "/universal/" | xargs -I {} cp {} dist/browser/ 2>/dev/null || true', { stdio: 'inherit' });
        execSync('find dist -maxdepth 2 -name "*.d.ts" -o -name "*.d.ts.map" | grep -v "/node/" | grep -v "/browser/" | grep -v "/universal/" | xargs -I {} cp {} dist/universal/ 2>/dev/null || true', { stdio: 'inherit' });

        console.log('Build completed successfully for all targets');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

build();