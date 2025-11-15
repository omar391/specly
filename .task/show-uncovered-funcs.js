import fs from 'fs';
import path from 'path';

const reportPath = path.join('apps', 'specly-server', 'coverage-report.json');
if (!fs.existsSync(reportPath)) {
  console.error('Coverage report not found at', reportPath);
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const targetSuffix = '/src/database/schema/global-schema.ts';
const key = Object.keys(data.coverageMap || {}).find(k => k.endsWith(targetSuffix));
if (!key) {
  console.error('Target file entry not found in coverageMap');
  process.exit(2);
}
const entry = data.coverageMap[key];
console.log('Coverage entry path:', key);
console.log('Functions map size:', Object.keys(entry.f || {}).length);
console.log('\nFunction coverage (raw):');
console.log(JSON.stringify(entry.fnMap || {}, null, 2));
console.log('\nFunction execution counts (f):');
console.log(JSON.stringify(entry.f || {}, null, 2));

console.log('\nUncovered functions (by id):');
const uncovered = Object.entries(entry.f || {}).filter(([,v]) => v === 0).map(([id]) => id);
console.log(uncovered.join(', '));

process.exit(0);
