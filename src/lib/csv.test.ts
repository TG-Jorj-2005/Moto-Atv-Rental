import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("csvCell", () => {
  it("leaves ordinary text and numbers alone and writes null as empty", () => {
    expect(csvCell("Honda Rebel 500")).toBe("Honda Rebel 500");
    expect(csvCell(1234.5)).toBe("1234.5");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(null)).toBe("");
  });
  it("neutralizes spreadsheet formulas", () => {
    for (const evil of ["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) expect(csvCell(evil).replace(/^"/, "")[0]).toBe("'");
  });
  it("quotes values with commas, quotes and line breaks and doubles the quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("quotes a neutralized value that also contains a comma", () => {
    expect(csvCell("=A1,B1")).toBe(`"'=A1,B1"`);
  });
});
