#!/usr/bin/env node
import fs from 'fs';

const coveragePath = process.argv[2] || './coverage/coverage-final.json';
const targetFile = process.argv[3];

if (!targetFile) {
    console.error('Usage: node find-uncovered.js <coverage-file> <target-file-pattern>');
    process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));

for (const [filePath, fileData] of Object.entries(coverage)) {
    if (filePath.includes(targetFile) && !filePath.includes('test')) {
        console.log(`\n=== ${filePath} ===\n`);

        // Uncovered statements
        const uncoveredStmts = [];
        for (const [id, count] of Object.entries(fileData.s)) {
            if (count === 0 && fileData.statementMap[id]) {
                uncoveredStmts.push(fileData.statementMap[id].start.line);
            }
        }
        if (uncoveredStmts.length > 0) {
            console.log('Uncovered statement lines:', uncoveredStmts.join(', '));
        }

        // Uncovered branches
        const uncoveredBranches = [];
        for (const [id, counts] of Object.entries(fileData.b)) {
            if (Array.isArray(counts) && counts.some(c => c === 0)) {
                const branch = fileData.branchMap[id];
                if (branch) {
                    uncoveredBranches.push({
                        id,
                        line: branch.loc.start.line,
                        type: branch.type,
                        counts
                    });
                }
            }
        }
        if (uncoveredBranches.length > 0) {
            console.log('\nUncovered branches:');
            for (const b of uncoveredBranches) {
                console.log(`  Branch ${b.id} at line ${b.line} (${b.type}): counts [${b.counts.join(',')}]`);
            }
        }

        // Uncovered functions
        const uncoveredFuncs = [];
        for (const [id, count] of Object.entries(fileData.f)) {
            if (count === 0 && fileData.fnMap[id]) {
                const fn = fileData.fnMap[id];
                uncoveredFuncs.push({
                    name: fn.name,
                    line: fn.loc.start.line
                });
            }
        }
        if (uncoveredFuncs.length > 0) {
            console.log('\nUncovered functions:');
            for (const f of uncoveredFuncs) {
                console.log(`  ${f.name} at line ${f.line}`);
            }
        }
    }
}
