import { describe, expect, it } from "vitest";
import pkg from "../package.json" assert { type: "json" };
import * as sdk from "../src/index.js";

const FORBIDDEN_SUBSTRINGS = ["@zendfi/sdk", "zendfi-toolkit"];

describe("package naming does not collide with the legacy merchant SDK (Requirement 7.2)", () => {
  it("package.json name contains none of the forbidden substrings", () => {
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(pkg.name).not.toContain(forbidden);
      expect(pkg.name).not.toEqual(forbidden);
    }
  });

  it("no top-level exported symbol name equals or contains a forbidden substring", () => {
    const exportedNames = Object.keys(sdk);
    expect(exportedNames.length).toBeGreaterThan(0);
    for (const name of exportedNames) {
      for (const forbidden of FORBIDDEN_SUBSTRINGS) {
        expect(name).not.toContain(forbidden);
        expect(name).not.toEqual(forbidden);
      }
    }
  });
});
