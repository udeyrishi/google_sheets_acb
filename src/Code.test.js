const { ACB_UNIT, UNITS_OWNED, TRANSACTION_EFFECTS, ASSET_REPORT } = require("./Code");

describe("ACB calculations", () => {
  it("calculates ACB per unit for a single buy", () => {
    const data = [
      ["Date", "Ticker", "Type", "Account", "Units", "Unit Price", "Fees", "Net Transaction Value"],
      [new Date("2024-01-01"), "ABC", "BUY", "Taxable", 10, 2, 1, 0],
    ];

    expect(UNITS_OWNED("ABC", null, data)).toBe(10);
    expect(ACB_UNIT("ABC", null, data)).toBeCloseTo(2.1, 6);
  });
});

describe("Transaction effects and reports", () => {
  const data = [
    ["Type", "Date", "Ticker", "Account", "Units", "Fees", "Unit Price", "Net Transaction Value"],
    ["BUY", new Date("2021-05-20"), "TSE:VEQT", "Wealthsimple", 10, 0, 10, -100],
    ["BUY", new Date("2021-05-20"), "TSE:VEQT", "Questrade", 10, 0, 12, -120],
    ["SELL", new Date("2021-06-01"), "TSE:VEQT", "Wealthsimple", 5, 0, 15, 75],
  ];

  it("emits global effects for each transaction", () => {
    const effects = TRANSACTION_EFFECTS(data);

    expect(effects[0]).toEqual(["ACB", "ACB Per Unit", "Total Units Owned", "Gain"]);
    expect(effects[1]).toEqual([100, 10, 10, 0]);
    expect(effects[2]).toEqual([220, 11, 20, 0]);
    expect(effects[3]).toEqual([165, 11, 15, 20]);
  });

  it("computes gain from the pre-sell global ACB on full disposals", () => {
    const fullSellData = [
      ["Type", "Date", "Ticker", "Account", "Units", "Fees", "Unit Price", "Net Transaction Value"],
      ["BUY", new Date("2021-05-20"), "TSE:AAA", "Wealthsimple", 10, 0, 10, -100],
      ["SELL", new Date("2021-06-01"), "TSE:AAA", "Wealthsimple", 10, 0, 12, 120],
    ];

    const effects = TRANSACTION_EFFECTS(fullSellData);

    expect(effects[0]).toEqual(["ACB", "ACB Per Unit", "Total Units Owned", "Gain"]);
    expect(effects[1]).toEqual([100, 10, 10, 0]);
    expect(effects[2]).toEqual([0, 0, 0, 20]);
  });

  it("reports global aggregates in asset report", () => {
    const report = ASSET_REPORT(data);

    expect(report[0]).toEqual(["Ticker", "Units Owned", "ACB", "ACB Per Unit"]);
    expect(report[1][0]).toBe("TSE:VEQT");
    expect(report[1][1]).toBe(15);
    expect(report[1][2]).toBe(165);
    expect(report[1][3]).toBeCloseTo(165 / 15, 6);
  });
});
