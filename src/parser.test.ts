import { parseTransactionRecord, calculateColumnIndices } from './parser';

describe('Parser helpers', () => {
  it('maps column indices for normalized headers', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Account',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];

    const indices = calculateColumnIndices(headers);

    expect(indices.Date).toBe(1);
    expect(indices.Ticker).toBe(2);
    expect(indices.Type).toBe(0);
    expect(indices.Units).toBe(4);
    expect(indices.Fees).toBe(5);
    expect(indices['Unit Price']).toBe(6);
    expect(indices['Net Transaction Value']).toBe(7);
  });

  it('throws when headers do not match expected names', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Account',
      'Units',
      ' Fees ',
      ' Unit Price ',
      ' Net Transaction Value ',
    ];

    expect(() => calculateColumnIndices(headers)).toThrow(/could not be found/i);
  });

  it('parses and normalizes transaction records', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Account',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];
    const indices = calculateColumnIndices(headers);

    const record = parseTransactionRecord(
      [' buy ', new Date('2021-05-20'), ' TSE:SHOP ', 'Wealthsimple', 10, 0, 151.07, 478898.24],
      indices,
    );

    expect(record).toEqual({
      date: new Date('2021-05-20'),
      ticker: 'TSE:SHOP',
      type: 'BUY',
      units: 10,
      unitPrice: 151.07,
      fees: 0,
      netTransactionValue: 478898.24,
    });
  });

  it('rejects unknown transaction types', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Account',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];
    const indices = calculateColumnIndices(headers);

    expect(() =>
      parseTransactionRecord(
        ['DIV', new Date('2021-05-20'), 'ABC', 'Taxable', 1, 0, 10, 10],
        indices,
      ),
    ).toThrow(/Unknown transaction type/i);
  });
});
