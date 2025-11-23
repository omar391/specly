/*
  Test Runtime Guard (TypeScript)
  Ensures tests only run under supported Node environment (>=20) and not under Bun's test runner.
  Rationale: better-sqlite3 native addon is not compatible with Bun's current N-API layer.
*/

if ((process as any).versions?.bun) {
  // eslint-disable-next-line no-console
  console.error('\n[TEST RUNTIME BLOCKED] Detected Bun runtime while running tests.');
  // eslint-disable-next-line no-console
  console.error('Use `pnpm test` (Node + Vitest). Native addon better-sqlite3 is unsupported under Bun test runtime.');
  process.exit(1);
}

const requiredMajor = 20;
const actualMajor = parseInt(process.versions.node.split('.')[0], 10);
if (actualMajor < requiredMajor) {
  // eslint-disable-next-line no-console
  console.error(`\n[TEST RUNTIME BLOCKED] Node ${process.versions.node} detected. Minimum required is ${requiredMajor}.x for native module compatibility.`);
  process.exit(1);
}
