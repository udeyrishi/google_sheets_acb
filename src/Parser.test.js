const { _parseTransactionRecord, _calculateColumnIndices } = require("./Parser");

describe("Parser helpers", () => {
  it("maps column indices for normalized headers", () => {
    const headers = [
      "Type",
      "Date",
      "Ticker",
      "Account",
      "Units",
      "Fees",
      "Unit Price",
      "Net Transaction Value",
    ];

    const indices = _calculateColumnIndices(headers);

    expect(indices.Date).toBe(1);
    expect(indices.Ticker).toBe(2);
    expect(indices.Type).toBe(0);
    expect(indices.Account).toBe(3);
    expect(indices.Units).toBe(4);
    expect(indices.Fees).toBe(5);
    expect(indices["Unit Price"]).toBe(6);
    expect(indices["Net Transaction Value"]).toBe(7);
  });

  it("throws when headers do not match expected names", () => {
    const headers = [
      "Type",
      "Date",
      "Ticker",
      "Account",
      "Units",
      " Fees ",
      " Unit Price ",
      " Net Transaction Value ",
    ];

    expect(() => _calculateColumnIndices(headers)).toThrow(/could not be found/i);
  });

  it("parses and normalizes transaction records", () => {
    const headers = [
      "Type",
      "Date",
      "Ticker",
      "Account",
      "Units",
      "Fees",
      "Unit Price",
      "Net Transaction Value",
    ];
    const indices = _calculateColumnIndices(headers);

    const record = _parseTransactionRecord(
      [" buy ", new Date("2021-05-20"), " TSE:SHOP ", " Wealthsimple ", 10, 0, 151.07, 478898.24],
      indices
    );

    expect(record.type).toBe("BUY");
    expect(record.ticker).toBe("TSE:SHOP");
    expect(record.account).toBe("Wealthsimple");
    expect(record.units).toBe(10);
  });

  it("rejects unknown transaction types", () => {
    const headers = [
      "Type",
      "Date",
      "Ticker",
      "Account",
      "Units",
      "Fees",
      "Unit Price",
      "Net Transaction Value",
    ];
    const indices = _calculateColumnIndices(headers);

    expect(() =>
      _parseTransactionRecord(
        ["DIV", new Date("2021-05-20"), "ABC", "Taxable", 1, 0, 10, 10],
        indices
      )
    ).toThrow(/Unknown transaction type/i);
  });
});
