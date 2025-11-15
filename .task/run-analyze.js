import fs from 'fs';
import path from 'path';

const reportPath = path.join('apps', 'specly-server', 'coverage-report.json');
if (!fs.existsSync(reportPath)) {
  console.error('Coverage report not found at', reportPath);
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const cov = data.coverageMap || {};

let files = Object.keys(cov)
  .filter(f => f.includes('/src/') && !f.includes('__tests__'))
  .map(f => {
    const d = cov[f] || {};
    const sTotal = Object.keys(d.s || {}).length;
    const sCovered = Object.values(d.s || {}).filter(v => v > 0).length;
    const bTotal = Object.keys(d.b || {}).length;
    const bCovered = Object.values(d.b || {}).filter(v => Array.isArray(v) ? v.some(x => x > 0) : v > 0).length;
    const fTotal = Object.keys(d.f || {}).length;
    const fCovered = Object.values(d.f || {}).filter(v => v > 0).length;

    const sPct = sTotal > 0 ? (sCovered / sTotal * 100) : 100;
    const bPct = bTotal > 0 ? (bCovered / bTotal * 100) : 100;
    const fPct = fTotal > 0 ? (fCovered / fTotal * 100) : 100;
    const avg = (sPct + bPct + fPct) / 3;

    return { file: f, avg, sPct, bPct, fPct, sTotal, sCovered, bTotal, bCovered, fTotal, fCovered };
  });

files.sort((a, b) => a.avg - b.avg);

console.log('Lowest coverage files (src/) — lowest first:\n');
files.slice(0, 20).forEach(f => {
  console.log(`${f.avg.toFixed(2)}% | S:${f.sPct.toFixed(1)}% (${f.sCovered}/${f.sTotal}) | B:${f.bPct.toFixed(1)}% (${f.bCovered}/${f.bTotal}) | F:${f.fPct.toFixed(1)}% (${f.fCovered}/${f.fTotal}) | ${f.file}`);
});

console.log(`\nTotal analyzed files: ${files.length}`);
