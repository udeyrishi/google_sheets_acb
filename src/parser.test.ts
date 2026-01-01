import type { TransactionRecord } from './financial_types';
import { parseTransactionRecord, calculateColumnIndices } from './parser';

describe('Parser helpers', () => {
  it('maps column indices for normalized headers', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];

    const indices = calculateColumnIndices(headers);

    expect(indices.Date).toBe(1);
    expect(indices.Ticker).toBe(2);
    expect(indices.Type).toBe(0);
    expect(indices.Units).toBe(3);
    expect(indices.Fees).toBe(4);
    expect(indices['Unit Price']).toBe(5);
    expect(indices['Net Transaction Value']).toBe(6);
  });

  it('normalizes headers with extra whitespace', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Units',
      ' Fees ',
      ' Unit Price ',
      ' Net Transaction Value ',
    ];

    const indices = calculateColumnIndices(headers);
    expect(indices.Type).toBe(0);
    expect(indices.Date).toBe(1);
    expect(indices.Ticker).toBe(2);
    expect(indices.Units).toBe(3);
    expect(indices.Fees).toBe(4);
    expect(indices['Unit Price']).toBe(5);
    expect(indices['Net Transaction Value']).toBe(6);
  });

  it('parses and normalizes transaction records', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];
    const indices = calculateColumnIndices(headers);

    const record = parseTransactionRecord(
      2,
      [' buy ', new Date('2021-05-20'), ' TSE:SHOP ', 10, 0, 151.07, 478898.24],
      indices,
    );

    expect(record).toEqual<TransactionRecord>({
      row: 2,
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
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];
    const indices = calculateColumnIndices(headers);

    expect(() =>
      parseTransactionRecord(1, ['DIV', new Date('2021-05-20'), 'ABC', 1, 0, 10, 10], indices),
    ).toThrow(/Unknown transaction type/i);
  });

  it('parses numeric strings with commas', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];
    const indices = calculateColumnIndices(headers);

    const record = parseTransactionRecord(
      2,
      ['BUY', new Date('2021-05-20'), 'TSE:SHOP', '1,234.5', '0.25', '1,000.00', '1,234,567.89'],
      indices,
    );

    expect(record.units).toBeCloseTo(1234.5, 6);
    expect(record.fees).toBeCloseTo(0.25, 6);
    expect(record.unitPrice).toBeCloseTo(1000, 6);
    expect(record.netTransactionValue).toBeCloseTo(1234567.89, 6);
  });

  it('rejects invalid dates', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];
    const indices = calculateColumnIndices(headers);

    expect(() =>
      parseTransactionRecord(
        3,
        ['BUY', '2021-05-20', 'TSE:SHOP', 10, 0, 151.07, 478898.24],
        indices,
      ),
    ).toThrow(/Transaction date/);
  });

  it('rejects non-string tickers', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];
    const indices = calculateColumnIndices(headers);

    expect(() =>
      parseTransactionRecord(
        4,
        ['BUY', new Date('2021-05-20'), 123, 10, 0, 151.07, 478898.24],
        indices,
      ),
    ).toThrow(/Ticker/);
  });

  it('rejects blank tickers', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];
    const indices = calculateColumnIndices(headers);

    expect(() =>
      parseTransactionRecord(
        1,
        ['BUY', new Date('2021-05-20'), '   ', 10, 0, 151.07, 478898.24],
        indices,
      ),
    ).toThrow(/Ticker/);
  });

  it('rejects non-numeric values for numeric fields', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];
    const indices = calculateColumnIndices(headers);

    expect(() =>
      parseTransactionRecord(
        1,
        ['BUY', new Date('2021-05-20'), 'TSE:SHOP', 'abc', 0, 151.07, 478898.24],
        indices,
      ),
    ).toThrow(/Units/);
  });

  it('rejects empty numeric strings for numeric fields', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];
    const indices = calculateColumnIndices(headers);

    expect(() =>
      parseTransactionRecord(
        1,
        ['BUY', new Date('2021-05-20'), 'TSE:SHOP', 10, '', 151.07, 478898.24],
        indices,
      ),
    ).toThrow(/Fees/);
  });

  it('rejects non-finite numbers for numeric fields', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];
    const indices = calculateColumnIndices(headers);

    expect(() =>
      parseTransactionRecord(
        1,
        ['BUY', new Date('2021-05-20'), 'TSE:SHOP', 10, 0, Number.NaN, 478898.24],
        indices,
      ),
    ).toThrow(/Unit price/);
  });

  it('rejects non-numeric net transaction values', () => {
    const headers = [
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ];
    const indices = calculateColumnIndices(headers);

    expect(() =>
      parseTransactionRecord(
        1,
        ['BUY', new Date('2021-05-20'), 'TSE:SHOP', 10, 0, 151.07, true],
        indices,
      ),
    ).toThrow(/Net transaction value/);
  });
});
