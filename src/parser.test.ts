import type { TransactionRecord } from './transaction_record';
import { parseTransactionRecord, calculateColumnIndices } from './parser';
import { Money } from './money';

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

    expect(indices.Type).toBe(0);
    expect(indices.Date).toBe(1);
    expect(indices.Ticker).toBe(2);
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
      [' buy ', new Date('2021-05-20'), ' TSE:SHOP ', 10, 0, 151.07, -1510.7],
      indices,
    );

    expect(record).toEqual<TransactionRecord>({
      row: 2,
      date: new Date('2021-05-20'),
      ticker: 'TSE:SHOP',
      type: 'BUY',
      units: 10,
      unitPrice: new Money(151.07),
      fees: Money.zero(),
      netTransactionValue: new Money(-1510.7),
      valueMode: 'components',
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
      ['BUY', new Date('2021-05-20'), 'TSE:SHOP', '1,234.5', '0.25', '1,000.00', '-1,234,500.25'],
      indices,
    );

    expect(record.valueMode).toBe<TransactionRecord['valueMode']>('components');
    expect(record.units).toBeCloseTo(1234.5, 6);
    expect(record.unitPrice).toStrictEqual(new Money(1000));
    expect(record.fees).toStrictEqual(new Money(0.25));
    expect(record.netTransactionValue).toStrictEqual(new Money(-1234500.25));
  });

  it('accepts dollar sign prefixes and suffixes for money values', () => {
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
      ['BUY', new Date('2021-05-20'), 'TSE:SHOP', 2, '$1', '$10', '-21$'],
      indices,
    );

    expect(record.valueMode).toBe<TransactionRecord['valueMode']>('components');
    expect(record.unitPrice).toStrictEqual(new Money(10));
    expect(record.fees).toStrictEqual(new Money(1));
    expect(record.netTransactionValue).toStrictEqual(new Money(-21));
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

  it('rejects non-numeric values for units', () => {
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

  it('rejects non-numeric values for unit price', () => {
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
        ['BUY', new Date('2021-05-20'), 'TSE:SHOP', 10, 0, 'abc', 478898.24],
        indices,
      ),
    ).toThrow(/Unit price/);
  });

  it('rejects missing units when only unit price is provided', () => {
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
        ['BUY', new Date('2021-05-20'), 'TSE:SHOP', '', 0, 151.07, ''],
        indices,
      ),
    ).toThrow(/Incomplete transaction data/);
  });

  it('rejects missing unit price when only units are provided', () => {
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
        ['BUY', new Date('2021-05-20'), 'TSE:SHOP', 10, 0, '', ''],
        indices,
      ),
    ).toThrow(/Incomplete transaction data/);
  });

  it('rejects non-finite numbers for unit price', () => {
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

  it('computes net transaction values when missing', () => {
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
      ['BUY', new Date('2021-05-20'), 'TSE:SHOP', 10, 1, 10, ''],
      indices,
    );

    expect(record.netTransactionValue).toStrictEqual(new Money(-101));
    expect(record.valueMode).toBe('components');
  });

  it('rejects net transaction values that do not match the expected formula', () => {
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
        2,
        ['SELL', new Date('2021-05-20'), 'TSE:SHOP', 10, 1, 10, 50],
        indices,
      ),
    ).toThrow(/did not match expected/);
  });

  it('computes unit price when units + NTV are provided', () => {
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
      ['SELL', new Date('2021-05-20'), 'TSE:SHOP', 10, 1, '', 99],
      indices,
    );

    expect(record.valueMode).toBe<TransactionRecord['valueMode']>('components');
    expect(record.unitPrice).toStrictEqual(new Money(10));
  });

  it('computes units when unit price + NTV are provided', () => {
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
      ['SELL', new Date('2021-05-20'), 'TSE:SHOP', '', 1, 10, 99],
      indices,
    );

    expect(record.valueMode).toBe('components');
    expect(record.units).toBeCloseTo(10, 6);
  });

  it('accepts net-only transactions for ROC and NCDIS', () => {
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
      ['ROC', new Date('2021-05-20'), 'TSE:SHOP', '', '', '', 12.5],
      indices,
    );

    expect(record.valueMode).toBe('netOnly');
    expect(record.netTransactionValue).toStrictEqual(new Money(12.5));
  });

  it('allows ROC/NCDIS to carry components and computes NTV', () => {
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
      ['NCDIS', new Date('2021-05-20'), 'TSE:SHOP', 2, '', 3, ''],
      indices,
    );

    expect(record.valueMode).toBe('components');
    expect(record.netTransactionValue).toStrictEqual(new Money(6));
  });

  it('rejects net-only transactions for non-ROC/NCDIS types', () => {
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
        2,
        ['BUY', new Date('2021-05-20'), 'TSE:SHOP', '', '', '', -10],
        indices,
      ),
    ).toThrow(/Net-only transaction rows are only supported/);
  });

  it('keeps fees optional for component-based transactions', () => {
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
      ['BUY', new Date('2021-05-20'), 'TSE:SHOP', 10, '', 10, ''],
      indices,
    );

    expect(record.valueMode).toBe('components');
    expect(record.fees).toBeUndefined();
    expect(record.netTransactionValue).toStrictEqual(new Money(-100));
  });

  it('rejects rows missing net transaction value and both components', () => {
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
        2,
        ['BUY', new Date('2021-05-20'), 'TSE:SHOP', '', '', '', ''],
        indices,
      ),
    ).toThrow(/Incomplete transaction data/);
  });
});
