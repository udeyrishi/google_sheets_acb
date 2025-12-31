const { ACB_UNIT, UNITS_OWNED } = require("./Code");

describe("ACB calculations", () => {
  it("calculates ACB per unit for a single buy", () => {
    const data = [
      ["Date", "Ticker", "Type", "Account", "Units", "Unit Price", "Fees", "Net Transaction Value"],
      [new Date("2024-01-01"), "ABC", "BUY", "Taxable", 10, 2, 1, 0],
    ];

    expect(UNITS_OWNED("ABC", "Taxable", data)).toBe(10);
    expect(ACB_UNIT("ABC", "Taxable", data)).toBeCloseTo(2.1, 6);
  });
});
