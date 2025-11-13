import fs from 'fs';
const data = JSON.parse(fs.readFileSync('coverage-report.json', 'utf8'));
const coverage = data.coverageMap;
const files = Object.keys(coverage).filter(f => f.includes('src/') && !f.includes('__tests__'));
const sorted = files.map(f => {
  const data = coverage[f];
  const statements = data.s ? Object.values(data.s).filter(v => v > 0).length / Object.keys(data.s).length * 100 : 0;
  const branches = data.b ? Object.values(data.b).filter(v => v > 0).length / Object.keys(data.b).length * 100 : 0;
  const functions = data.f ? Object.values(data.f).filter(v => v > 0).length / Object.keys(data.f).length * 100 : 0;
  const overall = (statements + branches + functions) / 3;
  // Fix path replacement to handle full absolute paths correctly
  const relativePath = f.replace(/.*\/apps\/specly-server\//, '');
  return { file: relativePath, coverage: overall, statements, branches, functions };
}).sort((a, b) => a.coverage - b.coverage);
console.log('Lowest coverage files:');
sorted.slice(0, 10).forEach(f => {
  console.log(`${f.file}: ${f.coverage.toFixed(2)}% (S: ${f.statements.toFixed(1)}%, B: ${f.branches.toFixed(1)}%, F: ${f.functions.toFixed(1)}%)`);
});