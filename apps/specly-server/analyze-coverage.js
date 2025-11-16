import fs from 'fs';
const data = JSON.parse(fs.readFileSync('coverage/coverage-final.json', 'utf8'));
const files = Object.keys(data).filter(f => f.includes('src/') && !f.includes('__tests__'));
const sorted = files.map(f => {
  const cov = data[f];
  const statements = cov.s ? (Object.values(cov.s).filter(v => v > 0).length / Object.keys(cov.s).length) * 100 : 0;
  const branches = cov.b ? (Object.values(cov.b).filter(v => v > 0).length / Object.keys(cov.b).length) * 100 : 0;
  const functions = cov.f ? (Object.values(cov.f).filter(v => v > 0).length / Object.keys(cov.f).length) * 100 : 0;
  const overall = (statements + branches + functions) / 3;
  // Fix path replacement to handle full absolute paths correctly
  const relativePath = f.replace(/.*\/apps\/specly-server\//, '');
  return { file: relativePath, coverage: overall, statements, branches, functions };
}).sort((a, b) => a.coverage - b.coverage);
console.log('Lowest coverage files:');
sorted.slice(0, 10).forEach(f => {
  console.log(`${f.file}: ${f.coverage.toFixed(2)}% (S: ${f.statements.toFixed(1)}%, B: ${f.branches.toFixed(1)}%, F: ${f.functions.toFixed(1)}%)`);
});