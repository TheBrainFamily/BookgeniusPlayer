# convex-test doesn't enforce return validators

## Issue

`convex-test` does not enforce `returns` validators on queries/mutations. Tests pass even when the return validator is missing fields, but the deployed function fails at runtime with `ReturnsValidationError`.

This creates a dangerous situation where:

1. Tests pass locally
2. Code gets deployed
3. Users hit runtime errors

## Repro

### 1. Create a simple schema and query

```typescript
// schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({ items: defineTable({ name: v.string() }) });
```

```typescript
// functions.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const listItems = query({
  args: {},
  // BUG: Missing _creationTime in validator - Convex adds it automatically
  returns: v.array(
    v.object({
      _id: v.id("items"),
      // _creationTime: v.number(),  <-- MISSING!
      name: v.string(),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db.query("items").collect();
  },
});
```

### 2. Write a test

```typescript
// functions.test.ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

describe("listItems", () => {
  it("returns items with _creationTime", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("items", { name: "Test Item" });
    });

    const result = await t.query(api.functions.listItems, {});

    expect(result).toHaveLength(1);
    expect(result[0]._creationTime).toBeDefined(); // Test checks for _creationTime
    expect(result[0].name).toBe("Test Item");
  });
});
```

### 3. Run the test

```bash
npx vitest run functions.test.ts
```

**Result: TEST PASSES**

The test passes because convex-test returns the raw database result (which includes `_creationTime`), without applying the return validator.

### 4. Deploy and call the function

```bash
npx convex deploy
npx convex run functions:listItems '{}'
```

**Result: RUNTIME ERROR**

```
Error: [Request ID: xxx] Server Error
Uncaught Error: ReturnsValidationError: Object contains extra field `_creationTime` that is not in the validator.
```

## Expected Behavior

`convex-test` should apply the `returns` validator to the result before returning it to the test, just like the real Convex runtime does. This would cause the test to fail with the same `ReturnsValidationError`, catching the bug before deployment.

## Workaround

Until this is fixed, ensure your tests explicitly check for all fields that Convex automatically adds:

```typescript
// Always check for system fields in tests
expect(result[0]._id).toBeDefined();
expect(result[0]._creationTime).toBeDefined();
```

And ensure your return validators include them:

```typescript
returns: v.array(
  v.object({
    _id: v.id("items"),
    _creationTime: v.number(),  // Don't forget this!
    name: v.string(),
  }),
),
```

## Impact

- **Severity**: High - leads to production runtime errors
- **Affected**: Any query/mutation with a `returns` validator that omits `_creationTime` or other system fields
- **Packages**: `convex-test` (tested with version that ships with convex@1.31.3)
