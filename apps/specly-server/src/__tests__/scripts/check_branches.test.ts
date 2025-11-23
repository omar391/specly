import { expect, test, describe } from 'vitest';

import findUncoveredBranches from '../../../check_branches.js';

describe('check_branches', () => {
  test('returns empty array when no spec-engine key present', () => {
    const uncovered = findUncoveredBranches({});
    expect(uncovered).toEqual([]);
  });

  test('returns uncovered branches when some counts are zero', () => {
    const cov = {
      'src/spec-engine.ts': {
        b: {
          '1': [0, 1],
          '2': [1, 1]
        },
        branchMap: {
          '1': { loc: { start: { line: 10 }, end: { line: 12 } }, type: 'if' },
          '2': { loc: { start: { line: 20 }, end: { line: 22 } }, type: 'if' }
        }
      }
    };
    const uncovered = findUncoveredBranches(cov);
    expect(uncovered.length).toBe(1);
    expect(uncovered[0]).toMatchObject({ id: '1', start: 10, end: 12, type: 'if', counts: [0, 1] });
  });

  test('returns empty when all counts are positive', () => {
    const cov = {
      'src/spec-engine.ts': {
        b: {
          '1': [1, 2],
          '2': [1, 3]
        },
        branchMap: {
          '1': { loc: { start: { line: 10 }, end: { line: 12 } }, type: 'if' },
          '2': { loc: { start: { line: 20 }, end: { line: 22 } }, type: 'if' }
        }
      }
    };
    const uncovered = findUncoveredBranches(cov);
    expect(uncovered).toEqual([]);
  });
});
