# Skill: test

## Checklist

```
□ Test file mirrors source: src/api/routes.ts → tests/integration/api-*.test.ts
□ Use createMemoryDb() + runMigrations() for DB tests
□ Every public API endpoint: 1 happy path + 1 error path (minimum)
□ Schema changes: verify existing data survives migration
□ Commander rules: test match + non-match per rule
□ npm test — all pass (never delete failing test to make suite pass)
```

## Patterns

### Unit test (no DB)
```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "../../../src/path/to/module";

describe("myFunction", () => {
  it("should [behavior] when [condition]", () => {
    const result = myFunction(input);
    expect(result).toEqual(expected);
  });
});
```

### Integration test (with DB)
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryDb, runMigrations } from "../../../src/db/connection";

describe("Feature", () => {
  let db;
  beforeEach(() => { db = createMemoryDb(); runMigrations(db, "migrations"); });

  it("should [behavior]", () => {
    // Arrange: seed data
    // Act: call function(db, ...)
    // Assert: check result + DB state + events
  });
});
```

## Running
```bash
npm test                    # full suite
npm test -- --watch         # watch mode
npm test -- path/to/file    # single file
```
