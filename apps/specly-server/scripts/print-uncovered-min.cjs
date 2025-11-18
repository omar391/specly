#!/usr/bin/env node
// Minimal uncovered-lines printer for Istanbul coverage JSON
// Usage:
//  node scripts/print-uncovered-min.cjs --report coverage/coverage-final.json --top 12
//  node scripts/print-uncovered-min.cjs --report coverage/coverage-final.json --target-file src/foo.ts
const fs = require('fs');
const path = require('path');

function parseArgs(argv){
  const out={};
  for(let i=2;i<argv.length;i++){
    const a=argv[i];
    if(a.startsWith('--')){
      const k=a.slice(2);
      const v=(argv[i+1] && !argv[i+1].startsWith('--'))? argv[++i] : 'true';
      out[k]=v;
    }
  }
  return out;
}

function loadCoverage(p){
  try{
    return JSON.parse(fs.readFileSync(p,'utf8'));
  }catch(_){ return null; }
}

function getUncoveredLines(entry){
  const stmtMap = entry.statementMap || {};
  const s = entry.s || {};
  const lines = [];
  for(const id of Object.keys(stmtMap)){
    if((s[id]||0)===0){
      const ln = stmtMap[id]?.start?.line;
      if(typeof ln==='number') lines.push(ln);
    }
  }
  return lines.sort((a,b)=>a-b);
}

(function main(){
  const args = parseArgs(process.argv);
  const reportPath = path.resolve(args.report || 'coverage/coverage-final.json');
  const top = parseInt(args.top || '12', 10);
  const targetFile = args['target-file'] || args['targetFile'] || null;
  const cov = loadCoverage(reportPath);
  if(!cov){ process.exit(0); }

  // Istanbul format: top-level keys are file paths; ignore 'total' and metadata
  const keys = Object.keys(cov).filter(k => !['total','schemaVersion','meta'].includes(k));

  if(targetFile){
    let key = keys.find(k=>k===targetFile) || keys.find(k=>k.endsWith('/'+targetFile)) || keys.find(k=>k.endsWith(targetFile));
    if(!key){
      console.log(`UNCOVERED_LINES:[] ${targetFile}`);
      process.exit(0);
    }
    const lines = getUncoveredLines(cov[key]||{});
    console.log(`UNCOVERED_LINES:[${lines.join(',')}] ${key}`);
    process.exit(0);
  }

  const rows = keys.map(k=>{
    const e = cov[k] || {};
    const lines = getUncoveredLines(e);
    const s = e.s || {};
    const total = Object.keys(s).length || 0;
    const covered = Object.values(s).filter(v=>v>0).length;
    const pct = total ? (covered*100/total) : 100;
    return { file:k, lines, count:lines.length, pct };
  }).filter(r=>r.count>0);

  rows.sort((a,b)=> a.count - b.count || a.pct - b.pct || a.file.localeCompare(b.file));
  const out = rows.slice(0, top);
  for(const r of out){
    console.log(`UNCOVERED_LINES:[${r.lines.join(',')}] ${r.file}`);
  }
})();
