const fs = require('fs')
const path = require('path')

const inPath = path.join(__dirname, '..', 'coverage', 'coverage-final.json')
const outPath = path.join(__dirname, '..', 'coverage-report.json')

if (!fs.existsSync(inPath)) {
  console.error('coverage-final.json not found at', inPath)
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(inPath, 'utf8'))
const report = { coverageMap: data }
fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log('Wrote coverage-report.json to', outPath)
