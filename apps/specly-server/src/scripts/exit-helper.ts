// Small wrapper around process.exit so tests can mock it safely.
export function exitProcess(code: number) {
  process.exit(code);
}
