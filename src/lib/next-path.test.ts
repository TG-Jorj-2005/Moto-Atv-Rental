import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    for (const ok of ["/", "/vehicles/abc", "/account/bookings?tab=past", "/vehicles/abc#book"]) expect(safeNextPath(ok)).toBe(ok);
  });
  it("sends everything else home, so it cannot be used to leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil.example", "", "/path\nSet-Cookie: x=1"]) expect(safeNextPath(bad)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
