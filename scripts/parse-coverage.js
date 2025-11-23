import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--report') options.report = args[++i];
        else if (args[i] === '--top') options.top = parseInt(args[++i], 10);
        else if (args[i] === '--target-file') options.targetFile = args[++i];
        else if (args[i] === '--emit-updated') options.emitUpdated = true;
    }
    return options;
}

function calculateCoverage(fileCoverage) {
    const metrics = ['s', 'b', 'f']; // statements, branches, functions
    let total = 0;
    let covered = 0;

    // Helper to calculate percentage for a specific metric type
    const getMetric = (type) => {
        const map = fileCoverage[type];
        let t = 0;
        let c = 0;
        if (!map) return 100; // If metric missing, assume 100% or not applicable

        Object.values(map).forEach(val => {
            if (Array.isArray(val)) { // branches
                val.forEach(hit => {
                    t++;
                    if (hit > 0) c++;
                });
            } else {
                t++;
                if (val > 0) c++;
            }
        });
        return t === 0 ? 100 : (c / t) * 100;
    };

    const stmt = getMetric('s');
    const branch = getMetric('b');
    const func = getMetric('f');

    return {
        stmt,
        branch,
        func,
        average: stmt
    };
}

function main() {
    const options = parseArgs();
    if (!options.report) {
        console.error('Error: --report required');
        process.exit(1);
    }

    try {
        if (!fs.existsSync(options.report)) {
            console.error(`Error: Report file not found at ${options.report}`);
            // If report doesn't exist yet (first run), we can't do much.
            process.exit(0);
        }

        const content = fs.readFileSync(options.report, 'utf8');
        const coverage = JSON.parse(content);

        if (options.targetFile) {
            // Single file mode
            // Find the key that ends with the target file path
            // Normalize paths for comparison
            const targetNormalized = path.normalize(options.targetFile);
            const fileKey = Object.keys(coverage).find(k => k.endsWith(targetNormalized) || k.endsWith(options.targetFile));

            if (!fileKey) {
                console.log(`FILE:${options.targetFile} STMT:0.0% BRANCH:0.0% FUNC:0.0% LINE:0.0%`);
                return;
            }

            const stats = calculateCoverage(coverage[fileKey]);
            console.log(`FILE:${options.targetFile} STMT:${stats.stmt.toFixed(1)}% BRANCH:${stats.branch.toFixed(1)}% FUNC:${stats.func.toFixed(1)}% LINE:${stats.stmt.toFixed(1)}%`);

        } else {
            // Detect mode
            const files = Object.keys(coverage).map(key => {
                const stats = calculateCoverage(coverage[key]);
                return {
                    file: key,
                    coverage: stats.average,
                    stats
                };
            });

            // Sort by coverage ascending
            files.sort((a, b) => a.coverage - b.coverage);

            const top = options.top || 20;
            files.slice(0, top).forEach(f => {
                // Output relative path if possible
                const relPath = path.relative(process.cwd(), f.file);
                console.log(`FILE:${relPath} COVERAGE:${f.coverage.toFixed(1)}%`);
            });
        }

    } catch (e) {
        console.error('Error parsing coverage:', e.message);
        process.exit(1);
    }
}

main();
