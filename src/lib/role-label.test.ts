import { describe, expect, it } from "vitest";
import { roleLabel } from "./role-label";

describe("roleLabel", () => {
  it("names the role", () => {
    expect(roleLabel("executive")).toBe("Executive");
    expect(roleLabel("trainer", null)).toBe("Trainer");
    expect(roleLabel("executive", null, true)).toBe("Exec");
  });

  it("shows a title in place of the role", () => {
    expect(roleLabel("executive", "Developer")).toBe("Developer");
    expect(roleLabel("executive", "Developer", true)).toBe("Developer");
  });

  it("ignores a blank title", () => {
    expect(roleLabel("trainee", "  ")).toBe("Trainee");
  });
});
