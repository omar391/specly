const fs = require('fs')
const path = require('path')

const inPath = path.join(__dirname, '..', 'coverage', 'coverage-final.json')
const outPath = path.join(__dirname, '..', 'coverage-report.json')

if (!fs.existsSync(inPath)) {
  console.error('coverage-final.json not found at', inPath)
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(inPath, 'utf8'))

const files = Object.keys(data).map(fileKey => {
  const item = data[fileKey]
  const stmtKeys = Object.keys(item.statementMap || {})
  const s = item.s || {}
  const stmtCovered = stmtKeys.filter(k => (s[k] || 0) > 0).length
  const statementsPct = stmtKeys.length ? Math.round((stmtCovered / stmtKeys.length) * 10000) / 100 : 100

  const branchKeys = Object.keys(item.branchMap || {})
  const b = item.b || {}
  let totalBranchLocations = 0
  let coveredBranchLocations = 0
  branchKeys.forEach(k => {
    const arr = Array.isArray(b[k]) ? b[k] : []
    totalBranchLocations += arr.length
    coveredBranchLocations += arr.filter(x => x > 0).length
  })
  const branchesPct = totalBranchLocations ? Math.round((coveredBranchLocations / totalBranchLocations) * 10000) / 100 : 100

  const fnKeys = Object.keys(item.fnMap || {})
  const f = item.f || {}
  const fnCovered = fnKeys.filter(k => (f[k] || 0) > 0).length
  const functionsPct = fnKeys.length ? Math.round((fnCovered / fnKeys.length) * 10000) / 100 : 100

  const missingStatements = stmtKeys.filter(k => !(s[k] > 0)).map(k => {
    const loc = item.statementMap[k]
    return loc && loc.start ? loc.start.line : null
  }).filter(Boolean)

  return {
    path: item.path || fileKey,
    statements: statementsPct,
    branches: branchesPct,
    functions: functionsPct,
    lines: statementsPct,
    missingStatements: Array.from(new Set(missingStatements)).sort((a,b)=>a-b)
  }
})

files.sort((a,b) => a.statements - b.statements)

fs.writeFileSync(outPath, JSON.stringify({ files }, null, 2))
console.log('Wrote coverage report to', outPath)
