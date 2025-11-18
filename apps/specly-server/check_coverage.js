const fs = require('fs');
const json = JSON.parse(fs.readFileSync('coverage/coverage-final.json', 'utf8'));
const file = '/Volumes/Projects/business/AstronLab/omar391/mcp-servers/specly-mcp/apps/specly-server/src/services/spec-engine.ts';
const entry = json[file];
if (!entry) { console.log('No entry for file'); process.exit(1); }
const lines = entry.lines || {};
const uncovered = Object.keys(lines).filter(l => lines[l] === 0);
console.log('Uncovered lines:', uncovered.join(', '));
