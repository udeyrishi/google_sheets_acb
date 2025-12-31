const { _calculateAggregates } = require("./Aggregation");

function tx({
  row,
  type,
  date,
  ticker = "TSE:AAA",
  units = 0,
  unitPrice = 0,
  fees = 0,
  netTransactionValue = 0,
}) {
  return {
    row,
    type,
    date,
    ticker,
    units,
    unitPrice,
    fees,
    netTransactionValue,
  };
}

describe("_calculateAggregates", () => {
  it("computes global ACB, units, and gains for buys and sells", () => {
    const transactions = [
      tx({ row: 2, type: "BUY", date: new Date("2021-05-20"), units: 10, unitPrice: 10 }),
      tx({ row: 3, type: "BUY", date: new Date("2021-05-21"), units: 10, unitPrice: 12 }),
      tx({ row: 4, type: "SELL", date: new Date("2021-06-01"), units: 5, unitPrice: 15 }),
    ];

    const { aggregates, effects } = _calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 20, totalCost: 220, gain: 0 },
      { unitsOwned: 15, totalCost: 165, gain: 20 },
    ]);
    expect(aggregates["TSE:AAA"]).toEqual({ unitsOwned: 15, totalCost: 165 });
  });

  it("computes gain correctly on full disposals", () => {
    const transactions = [
      tx({ row: 2, type: "BUY", date: new Date("2021-05-20"), units: 10, unitPrice: 10 }),
      tx({ row: 3, type: "SELL", date: new Date("2021-06-01"), units: 10, unitPrice: 12 }),
    ];

    const { effects } = _calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 0, totalCost: 0, gain: 20 },
    ]);
  });

  it("treats DRIP as a buy", () => {
    const transactions = [
      tx({ row: 2, type: "BUY", date: new Date("2022-01-01"), units: 10, unitPrice: 10 }),
      tx({ row: 3, type: "DRIP", date: new Date("2022-01-02"), units: 2, unitPrice: 11 }),
    ];

    const { effects } = _calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 12, totalCost: 122, gain: 0 },
    ]);
  });

  it("treats STK_RWD as units-only", () => {
    const transactions = [
      tx({ row: 2, type: "BUY", date: new Date("2022-01-01"), units: 10, unitPrice: 10 }),
      tx({ row: 3, type: "STK_RWD", date: new Date("2022-01-02"), units: 3 }),
    ];

    const { effects } = _calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 13, totalCost: 100, gain: 0 },
    ]);
  });

  it("applies non-cash distributions to ACB", () => {
    const transactions = [
      tx({ row: 2, type: "BUY", date: new Date("2022-01-01"), units: 10, unitPrice: 10 }),
      tx({ row: 3, type: "NCDIS", date: new Date("2022-02-01"), netTransactionValue: 5 }),
    ];

    const { effects } = _calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 10, totalCost: 105, gain: 0 },
    ]);
  });

  it("applies returns of capital to ACB", () => {
    const transactions = [
      tx({ row: 2, type: "BUY", date: new Date("2022-01-01"), units: 10, unitPrice: 10 }),
      tx({ row: 3, type: "ROC", date: new Date("2022-02-01"), netTransactionValue: 2 }),
    ];

    const { effects } = _calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 10, totalCost: 98, gain: 0 },
    ]);
  });

  it("ignores TRF_IN/TRF_OUT for global ACB", () => {
    const transactions = [
      tx({ row: 2, type: "BUY", date: new Date("2022-01-01"), units: 10, unitPrice: 10 }),
      tx({ row: 3, type: "TRF_OUT", date: new Date("2022-02-01"), units: 5, unitPrice: 10 }),
      tx({ row: 4, type: "TRF_IN", date: new Date("2022-02-02"), units: 5, unitPrice: 10 }),
    ];

    const { effects } = _calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 10, totalCost: 100, gain: 0 },
    ]);
  });

  it("tracks aggregates independently for interleaved tickers", () => {
    const transactions = [
      tx({ row: 2, type: "BUY", date: new Date("2022-01-01"), ticker: "TSE:AAA", units: 10, unitPrice: 10 }),
      tx({ row: 3, type: "BUY", date: new Date("2022-01-02"), ticker: "TSE:BBB", units: 5, unitPrice: 20 }),
      tx({ row: 4, type: "SELL", date: new Date("2022-01-03"), ticker: "TSE:AAA", units: 4, unitPrice: 12 }),
      tx({ row: 5, type: "DRIP", date: new Date("2022-01-04"), ticker: "TSE:BBB", units: 1, unitPrice: 22 }),
    ];

    const { aggregates, effects } = _calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 5, totalCost: 100, gain: 0 },
      { unitsOwned: 6, totalCost: 60, gain: 8 },
      { unitsOwned: 6, totalCost: 122, gain: 0 },
    ]);
    expect(aggregates).toEqual({
      "TSE:AAA": { unitsOwned: 6, totalCost: 60 },
      "TSE:BBB": { unitsOwned: 6, totalCost: 122 },
    });
  });

  it("computes gains per ticker without cross-contamination", () => {
    const transactions = [
      tx({ row: 2, type: "BUY", date: new Date("2022-01-01"), ticker: "TSE:AAA", units: 10, unitPrice: 10 }),
      tx({ row: 3, type: "BUY", date: new Date("2022-01-02"), ticker: "TSE:BBB", units: 10, unitPrice: 30 }),
      tx({ row: 4, type: "SELL", date: new Date("2022-01-03"), ticker: "TSE:BBB", units: 4, unitPrice: 25 }),
      tx({ row: 5, type: "SELL", date: new Date("2022-01-04"), ticker: "TSE:AAA", units: 4, unitPrice: 12 }),
    ];

    const { effects } = _calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 10, totalCost: 300, gain: 0 },
      { unitsOwned: 6, totalCost: 180, gain: -20 },
      { unitsOwned: 6, totalCost: 60, gain: 8 },
    ]);
  });

  it("rejects negative NCDIS values", () => {
    const base = [tx({ row: 2, type: "BUY", date: new Date("2022-01-01"), units: 10, unitPrice: 10 })];

    expect(() =>
      _calculateAggregates([...base, tx({ row: 3, type: "NCDIS", date: new Date("2022-02-01"), netTransactionValue: -1 })])
    ).toThrow(/Non-cash distributions/);
  });

  it("rejects negative ROC values", () => {
    const base = [tx({ row: 2, type: "BUY", date: new Date("2022-01-01"), units: 10, unitPrice: 10 })];

    expect(() =>
      _calculateAggregates([...base, tx({ row: 3, type: "ROC", date: new Date("2022-02-01"), netTransactionValue: -1 })])
    ).toThrow(/Returns of capital/);
  });

  it("rejects unknown transaction types", () => {
    expect(() =>
      _calculateAggregates([tx({ row: 2, type: "DIV", date: new Date("2022-01-01") })])
    ).toThrow(/Unknown transaction type/);
  });

  it("rejects out-of-order dates", () => {
    expect(() =>
      _calculateAggregates([
        tx({ row: 2, type: "BUY", date: new Date("2022-02-01"), units: 10, unitPrice: 10 }),
        tx({ row: 3, type: "BUY", date: new Date("2022-01-01"), units: 1, unitPrice: 10 }),
      ])
    ).toThrow(/Transaction date is less/);
  });
});
