import { test } from "node:test";
import assert from "node:assert";

test("toolchain runs", () => {
  const result = 1 + 1;
  assert.equal(result, 2);
});
