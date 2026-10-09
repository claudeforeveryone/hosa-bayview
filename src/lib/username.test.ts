import { describe, expect, it } from "vitest";
import { usernameKey } from "./username";

describe("usernameKey", () => {
  it("matches a name however it's typed", () => {
    for (const v of ["KadenLi", "Kaden Li", "kaden.li", "kaden-li", " KADEN_LI "]) expect(usernameKey(v)).toBe("kadenli");
  });
  it("keeps different names apart", () => {
    expect(usernameKey("Jenna Bae")).not.toBe(usernameKey("Bernice Au"));
  });
});
