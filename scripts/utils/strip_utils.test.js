const { stripForGas } = require("./strip_utils");

describe("stripForGas", () => {
  const START = "// @gas-remove-start";
  const END = "// @gas-remove-end";

  it("removes tagged blocks", () => {
    const input = [
      "const a = 1;",
      START,
      "const b = 2;",
      END,
      "const c = 3;",
    ].join("\n");

    expect(stripForGas(input, START, END)).toBe(["const a = 1;", "const c = 3;"].join("\n"));
  });

  it("preserves content before an inline start tag", () => {
    const input = `const a = 1; ${START}\nconst b = 2;\n${END}\nconst c = 3;`;
    expect(stripForGas(input, START, END)).toBe(["const a = 1; ", "const c = 3;"].join("\n"));
  });

  it("preserves content after an inline end tag", () => {
    const input = `const a = 1;\n${START}\nconst b = 2;\n${END} const c = 3;`;
    expect(stripForGas(input, START, END)).toBe(["const a = 1;", " const c = 3;"].join("\n"));
  });

  it("throws if end tag is missing", () => {
    const input = `const a = 1;\n${START}\nconst b = 2;`;
    expect(() => stripForGas(input, START, END)).toThrow(/Missing/);
  });
});
