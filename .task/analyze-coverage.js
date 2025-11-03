import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coverageFile = path.join(__dirname, '../coverage/coverage-final.json');
const data = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));

const files = [];

for (const [filePath, info] of Object.entries(data)) {
  if (info.all) continue; // Skip empty files
  
  const totalStmts = Object.keys(info.s || {}).length;
  const coveredStmts = Object.values(info.s || {}).filter(v => v > 0).length;
  
  const totalBranches = Object.keys(info.b || {}).length;
  const coveredBranches = Object.values(info.b || {}).filter(v => 
    Array.isArray(v) ? v.some(x => x > 0) : v > 0
  ).length;
  
  const totalFuncs = Object.keys(info.f || {}).length;
  const coveredFuncs = Object.values(info.f || {}).filter(v => v > 0).length;
  
  const stmtPct = totalStmts > 0 ? (coveredStmts / totalStmts * 100) : 100;
  const branchPct = totalBranches > 0 ? (coveredBranches / totalBranches * 100) : 100;
  const funcPct = totalFuncs > 0 ? (coveredFuncs / totalFuncs * 100) : 100;
  
  const avgPct = (stmtPct + branchPct + funcPct) / 3;
  
  const filename = filePath.includes('/src/') ? filePath.split('/src/')[1] : path.basename(filePath);
  
  files.push({
    file: filename,
    path: filePath,
    stmtPct,
    branchPct,
    funcPct,
    avgPct,
    totalStmts,
    coveredStmts,
    totalBranches,
    coveredBranches,
    totalFuncs,
    coveredFuncs
  });
}

files.sort((a, b) => a.avgPct - b.avgPct);

console.log('Files sorted by average coverage (lowest first):\n');
for (const f of files) {
  console.log(`${f.avgPct.toFixed(1)}% | Stmt: ${f.stmtPct.toFixed(1)}% (${f.coveredStmts}/${f.totalStmts}) | Branch: ${f.branchPct.toFixed(1)}% (${f.coveredBranches}/${f.totalBranches}) | Func: ${f.funcPct.toFixed(1)}% (${f.coveredFuncs}/${f.totalFuncs}) | ${f.file}`);
}

console.log(`\n\nTotal files: ${files.length}`);
console.log(`Files below 95%: ${files.filter(f => f.avgPct < 95).length}`);

// Output JSON for further processing
fs.writeFileSync(
  path.join(__dirname, 'coverage-analysis.json'),
  JSON.stringify(files, null, 2)
);
