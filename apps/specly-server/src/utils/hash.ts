import { createHash } from 'crypto';
import { getOrComputeHash } from './hash-cache.js';

/**
 * Canonical JSON stringifier ensuring:
 * - Stable key ordering (lexicographic) for objects
 * - Stable array ordering preserved as given
 * - No whitespace / formatting differences
 * - Distinguishes types accurately (null vs object, numbers as-is)
 */
export function canonicalStringify(value: unknown): string {
  return internalCanonical(value);
}

function internalCanonical(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(v => internalCanonical(v)).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(JSON.stringify(k) + ':' + internalCanonical(value[k]));
  }
  return '{' + parts.join(',') + '}';
}

export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Computes a canonical hash for a spec object.
 * Accepts any plain JSON-like structure. Users must ensure no functions / Dates.
 */
export function hashSpec(spec: unknown): { hash: string; canonical: string } {
  const canonical = canonicalStringify(spec);
  const hashed = getOrComputeHash(canonical, () => sha256(canonical));
  return { hash: hashed, canonical };
}

/**
 * Tool version hash: expects an object with ordered_specs (array) and edges (array).
 * We canonicalize by sorting edges deterministically by (from,to,priority?) fields while leaving
 * ordered_specs as provided (caller responsible for ensuring correct order semantics).
 */
export function hashToolVersion(input: { ordered_specs: any[]; edges: any[]; [k: string]: any }): { hash: string; canonical: string } {
  const { ordered_specs, edges, ...rest } = input;
  // Sort edges deterministically
  const sortedEdges = [...edges].sort((a, b) => {
    const aKey = JSON.stringify([a.from, a.to, a.priority ?? 0]);
    const bKey = JSON.stringify([b.from, b.to, b.priority ?? 0]);
    return aKey.localeCompare(bKey);
  });
  const normalized = { ...rest, ordered_specs, edges: sortedEdges };
  const canonical = canonicalStringify(normalized);
  const hashed = getOrComputeHash(canonical, () => sha256(canonical));
  return { hash: hashed, canonical };
}

/**
 * Convenience stable hash for arbitrary JSON.
 */
export function stableHash(value: unknown): string {
  const canonical = canonicalStringify(value);
  return getOrComputeHash(canonical, () => sha256(canonical));
}
