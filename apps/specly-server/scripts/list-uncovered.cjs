const fs = require('fs');
const covPath = './coverage/coverage-final.json';
if (!fs.existsSync(covPath)) { console.error('coverage file not found'); process.exit(2);} 
const cov = JSON.parse(fs.readFileSync(covPath, 'utf8'));
const entries = Object.entries(cov);
const low = entries.map(([path, entry]) => {
  const stmtMap = entry.statementMap || {};
  const s = entry.s || {};
  const totalStmts = Object.keys(stmtMap).length;
  const coveredStmts = Object.values(s).filter(v=>v>0).length;
  const stmtPct = totalStmts? (coveredStmts/totalStmts*100):100;
  const fnMap = entry.fnMap||{}; const f = entry.f||{};
  const totalFns = Object.keys(fnMap).length; const coveredFns = Object.values(f).filter(v=>v>0).length; const fnPct = totalFns? (coveredFns/totalFns*100):100;
  const branchMap = entry.branchMap||{}; const b = entry.b||{}; let totalBranches=0, coveredBranches=0; for(const k of Object.keys(branchMap)){ const arr=b[k]||[]; totalBranches+=arr.length; coveredBranches+=arr.filter(v=>v>0).length }
  const branchPct = totalBranches? (coveredBranches/totalBranches*100):100;
  const uncoveredLines = [];
  Object.keys(stmtMap).forEach(k=>{ if((s[k]||0)===0) uncoveredLines.push(stmtMap[k].start.line); });
  return { path, stmtPct, fnPct, branchPct, uncoveredLines };
}).filter(x => x.stmtPct < 100 || x.fnPct < 100 || x.branchPct < 100).sort((a,b)=> a.stmtPct - b.stmtPct);
console.log(JSON.stringify(low, null, 2));
