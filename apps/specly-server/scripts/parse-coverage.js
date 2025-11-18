#!/usr/bin/env node
/**
 * parse-coverage.js
 *
 * Minimal CLI to parse vitest/istanbul coverage JSON and emit stable, machine-parseable lines
 *
 * Usage:
 *  node parse-coverage.js --report coverage/coverage-final.json --top 12
 *  node parse-coverage.js --report coverage/coverage-final.json --target-file src/foo.ts --emit-updated
 *
 * Outputs (detect mode):
 *  COVERAGE_JSON=<path>
 *  FILE_COVERAGE:<percent> <path>
 *  LOWEST_FILE=<path>
 *
 * Outputs (single-file mode):
 *  FILE_COVERAGE_AFTER:<percent> <path>
 *  UPDATED_REPORT=<path>   (optional)
 */
import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.replace(/^--/, '');
            const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
            out[key] = val;
        }
    }
    return out;
}

function safeReadJson(p) {
    try {
        const buf = fs.readFileSync(p, 'utf8');
        return JSON.parse(buf);
    } catch (e) {
        return null;
    }
}

function getPctFromEntry(entry) {
    // Prefer statements.pct then lines.pct then functions.pct then compute from covered/total
    if (!entry || typeof entry !== 'object') return null;
    const candidates = ['statements', 'lines', 'functions', 'branches'];
    for (const k of candidates) {
        if (entry[k] && typeof entry[k].pct === 'number') return entry[k].pct;
        if (entry[k] && typeof entry[k].covered === 'number' && typeof entry[k].total === 'number' && entry[k].total > 0) {
            return Math.round((entry[k].covered * 100) / entry[k].total);
        }
    }
    // fallback: check any number-like pct at top-level
    if (typeof entry.pct === 'number') return entry.pct;

    // Handle raw istanbul format (v8): compute from 's', 'b', 'f' maps
    if (entry.s && typeof entry.s === 'object') {
        // statements: count how many have > 0 executions
        const totalStatements = Object.keys(entry.s).length;
        const coveredStatements = Object.values(entry.s).filter(count => count > 0).length;
        if (totalStatements > 0) {
            return Math.round((coveredStatements * 100) / totalStatements);
        }
    }

    return null;
}

function normalizeFileKey(k) {
    // Istanbul keys may be absolute. Normalize to workspace-relative where possible.
    return k;
}

(function main() {
    const args = parseArgs(process.argv);
    const reportPath = args.report || 'coverage/coverage-final.json';
    const top = parseInt(args.top || '12', 10);
    const targetFile = args['target-file'] || args['targetFile'] || null;
    const emitUpdated = args['emit-updated'] === 'true' || args['emit-updated'] === '1' || args['emit-updated'] === true;

    const resolvedReport = path.resolve(reportPath);
    console.log(`COVERAGE_JSON=${reportPath}`);

    const json = safeReadJson(resolvedReport);
    if (!json) {
        // no report - exit gracefully but with a useful message on stderr
        // Keep stdout minimal (we already printed COVERAGE_JSON)
        // Print no FILE_COVERAGE lines
        process.exit(0);
    }

    // Detect coverage file formats:
    // 1) Istanbul format: keys are file paths -> { "path": { statements: {...}, lines: {...} } , "total": {...} }
    // 2) Some reporters embed { files: [ { file: 'x', lines: { pct: 90 } }, ... ] }
    let entries = [];

    if (Array.isArray(json.files)) {
        for (const f of json.files) {
            const file = f.file || f.filename || f.path;
            const pct = getPctFromEntry(f);
            if (file && pct !== null) entries.push({ file, pct });
        }
    } else {
        // iterate keys
        for (const k of Object.keys(json)) {
            if (k === 'total' || k === 'schemaVersion' || k === 'meta') continue;
            const entry = json[k];
            const pct = getPctFromEntry(entry);
            const file = k;
            if (pct !== null) entries.push({ file, pct });
        }
    }

    if (entries.length === 0) {
        process.exit(0);
    }

    // Sort ascending by percentage (lowest first)
    entries.sort((a, b) => a.pct - b.pct || a.file.localeCompare(b.file));

    if (targetFile) {
        // Try to find matching file entry (exact or suffix match)
        let match = entries.find(e => e.file === targetFile);
        if (!match) {
            match = entries.find(e => e.file.endsWith(targetFile));
        }
        if (!match) {
            // try normalized path with ./ prefix
            match = entries.find(e => e.file === ('./' + targetFile)) || entries.find(e => e.file.endsWith('/' + targetFile));
        }
        const pct = match ? match.pct : 0;
        const filePath = match ? match.file : targetFile;
        console.log(`FILE_COVERAGE_AFTER:${pct} ${filePath}`);
        if (emitUpdated) {
            console.log(`UPDATED_REPORT=${reportPath}`);
        }
        process.exit(0);
    }

    // detect-coverage mode: print lowest TOP entries
    const list = entries.slice(0, top);
    for (const e of list) {
        console.log(`FILE_COVERAGE:${Math.round(e.pct)} ${e.file}`);
    }
    const lowest = list[0];
    if (lowest) {
        console.log(`LOWEST_FILE=${lowest.file}`);
    }
})();