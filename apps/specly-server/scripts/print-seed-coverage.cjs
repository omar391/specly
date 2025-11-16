const fs = require('fs');
const path = '/Volumes/Projects/business/AstronLab/omar391/mcp-servers/specly-mcp/apps/specly-server/src/scripts/seed-specly.ts';
const covPath = './coverage/coverage-final.json';
if (!fs.existsSync(covPath)) {
  console.error('coverage file not found:', covPath);
  process.exit(2);
}
const cov = JSON.parse(fs.readFileSync(covPath, 'utf8'));
const entry = cov[path];
if (!entry) {
  console.error('Coverage entry not found for', path);
  process.exit(3);
}
const stmtMap = entry.statementMap; const s = entry.s;
const totalStmts = Object.keys(stmtMap).length;
const coveredStmts = Object.values(s).filter(v => v > 0).length;
const stmtPct = (coveredStmts / totalStmts * 100).toFixed(2);
const fnMap = entry.fnMap; const f = entry.f;
const totalFns = Object.keys(fnMap).length;
const coveredFns = Object.values(f).filter(v => v > 0).length;
const fnPct = (coveredFns / totalFns * 100).toFixed(2);
const branchMap = entry.branchMap || {}; const b = entry.b || {};
let totalBranches = 0; let coveredBranches = 0;
for (const k of Object.keys(branchMap)) {
  const arr = b[k] || [];
  totalBranches += arr.length;
  coveredBranches += arr.filter(v => v > 0).length;
}
const branchPct = totalBranches ? (coveredBranches / totalBranches * 100).toFixed(2) : '100.00';
let uncovered = [];
Object.keys(stmtMap).forEach(k => { if (s[k] === 0) uncovered.push(stmtMap[k].start.line); });
uncovered = [...new Set(uncovered)].sort((a,b) => a-b);
const result = {
  path,
  statements: { covered: coveredStmts, total: totalStmts, pct: stmtPct },
  functions: { covered: coveredFns, total: totalFns, pct: fnPct },
  branches: { covered: coveredBranches, total: totalBranches, pct: branchPct },
  uncoveredLines: uncovered
};
console.log(JSON.stringify(result, null, 2));
