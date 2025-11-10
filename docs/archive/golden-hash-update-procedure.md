# Golden Hash Fixture Update Procedure (SP-200)

## Purpose
Golden hash fixtures provide regression guards to detect unintended changes to hash computation logic. If these tests fail, it indicates:
1. A bug in canonicalization/hashing
2. An intentional breaking change requiring documentation

## Fixtures Location
`./src/__tests__/fixtures/spec-*.json`

## Current Fixtures (6 edge case vectors)
1. **spec-example.json** - Basic structure baseline
2. **spec-unicode.json** - Unicode normalization (emoji, Chinese, RTL text)
3. **spec-deep-nesting.json** - Deep object nesting (4 levels)
4. **spec-array-ordering.json** - Array order sensitivity
5. **spec-special-chars.json** - Special character escaping (newlines, tabs, quotes, backslashes)
6. **spec-empty-values.json** - Empty strings, arrays, objects

## Update Procedure
When adding a new fixture or modifying existing ones:

### 1. Add/Modify Fixture
```bash
# Create new fixture
echo '{ "name": "test", "data": "..." }' > ./src/__tests__/fixtures/spec-new-case.json
```

### 2. Run Tests to Compute Hash
```bash
pnpm test src/__tests__/hash.golden.test.ts --run
```

Look for console output:
```text
Golden hash for spec-new-case.json: abc123...
Update GOLDEN_HASHES in hash.golden.test.ts with this value
```

### 3. Update Test File
Edit `./src/__tests__/hash.golden.test.ts`:
```typescript
const GOLDEN_HASHES: Record<string, string> = {
  // ... existing ...
  'spec-new-case.json': 'abc123...', // Copy computed hash here
};
```

### 4. Verify Tests Pass
```bash
pnpm test src/__tests__/hash.golden.test.ts --run
```
All tests should now pass.

### 5. Document Change
If modifying existing fixture:
- Add comment explaining why hash changed
- Reference task ID (e.g., SP-002, SP-200)
- Update this document with reasoning

## Intentional Breaking Changes
If hash algorithm changes intentionally:
1. Run full test suite: `pnpm test --run`
2. Recompute ALL golden hashes
3. Update GOLDEN_HASHES dictionary with new values
4. Document in CHANGELOG.md:
   ```text
   ## [Version] - Date
   ### Breaking Changes
   - Hash algorithm updated: [reason]
   - All existing spec/tool hashes will change
   - Migration: Re-publish all tool versions
   ```

## Failure Investigation
If golden test fails unexpectedly:
1. Compare expected vs received hash
2. Check recent commits for hash.ts changes
3. Verify fixture file wasn't corrupted
4. Re-read fixture and inspect canonical JSON

## Edge Case Coverage
Tests verify:
- ✅ Unicode normalization stability
- ✅ Key order canonicalization (objects sorted)
- ✅ Array order preservation (not sorted)
- ✅ Empty value handling (consistent)
- ✅ Special character escaping (newlines, tabs, quotes)
- ✅ Deep nesting (4+ levels)
- ✅ Tool version edge ordering (canonical sort)
- ✅ Priority value sensitivity

## Maintenance Schedule
- Review fixtures quarterly
- Add new edge cases when bugs found
- Expand coverage for reported hash collisions (none to date)
