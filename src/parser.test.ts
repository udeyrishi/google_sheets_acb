import type { TransactionRecord } from './transaction_record';
import { parseTransactionRecord, calculateColumnIndices } from './parser';
import { Money } from './money';
import { Shares } from './shares';

describe('Transaction normalization', () => {
  it('rejects zero units before computing NTV from units and price', () => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    expect(() =>
      parseTransactionRecord(7, ['BUY', new Date('2024-01-01'), 'ABC', 0, '', 10, ''], indices),
    ).toThrow(/^\[row: 7\]: Failed to parse the transaction record[\s\S]*Units must be positive/);
  });

  it('rejects negative units before validating a fully supplied NTV', () => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    expect(() =>
      parseTransactionRecord(7, ['BUY', new Date('2024-01-01'), 'ABC', -1, '', 10, 10], indices),
    ).toThrow(/^\[row: 7\]: Failed to parse the transaction record[\s\S]*Units must be positive/);
  });

  it.each([
    { type: 'TRF_IN', units: 0 },
    { type: 'TRF_OUT', units: -1 },
  ])('$type: rejects units $units before deferring valuation', ({ type, units }) => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    expect(() =>
      parseTransactionRecord(7, [type, new Date('2024-01-01'), 'ABC', units, '', '', ''], indices),
    ).toThrow(/^\[row: 7\]: Failed to parse the transaction record[\s\S]*Units must be positive/);
  });

  it.each(['TRF_IN', 'TRF_OUT'])('%s: defers valuation when only units are supplied', (type) => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    const record = parseTransactionRecord(
      7,
      [type, new Date('2024-01-01'), 'ABC', 10, '', '', ''],
      indices,
    );

    expect(record.valueMode).toBe('potentiallyInferrable');
    expect(record.units).toEqual(new Shares(10));
    expect(record.unitPrice).toBeUndefined();
    expect(record.netTransactionValue).toBeUndefined();
  });

  it.each([
    { type: 'TRF_IN', ntv: 100 },
    { type: 'TRF_OUT', ntv: -100 },
  ])('$type: rejects NTV without units or price', ({ type, ntv }) => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);

    expect(() =>
      parseTransactionRecord(7, [type, new Date('2024-01-01'), 'ABC', '', '', '', ntv], indices),
    ).toThrow(
      /^\[row: 7\]: Failed to parse the transaction record[\s\S]*Net-only transaction rows are only supported/,
    );
  });

  it.each([0, -1, '0', '-1', 0.00000000001])(
    'BUY: rejects supplied units %p at or below zero share precision',
    (units) => {
      const indices = calculateColumnIndices([
        'Type',
        'Date',
        'Ticker',
        'Units',
        'Fees',
        'Unit Price',
        'Net Transaction Value',
      ]);

      expect(() =>
        parseTransactionRecord(
          7,
          ['BUY', new Date('2024-01-01'), 'ABC', units, '', '', -100],
          indices,
        ),
      ).toThrow(/^\[row: 7\]: Failed to parse the transaction record[\s\S]*Units must be positive/);
    },
  );

  it.each([0, 10])('BUY: rejects nonpositive units derived from NTV %s and price 10', (ntv) => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);

    expect(() =>
      parseTransactionRecord(7, ['BUY', new Date('2024-01-01'), 'ABC', '', '', 10, ntv], indices),
    ).toThrow(/^\[row: 7\]: Failed to parse the transaction record[\s\S]*Units must be positive/);
  });

  it('BUY: accepts positive fractional units', () => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    const record = parseTransactionRecord(
      7,
      ['BUY', new Date('2024-01-01'), 'ABC', 0.25, '', 10, ''],
      indices,
    );

    expect(record.units).toEqual(new Shares(0.25));
  });

  it('BUY: derives missing unit price', () => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    const record = parseTransactionRecord(
      7,
      ['BUY', new Date('2024-01-01'), 'ABC', 10, '', '', -100],
      indices,
    );

    expect(record.valueMode).toBe('components');
    expect(record.units).toEqual(new Shares(10));
    expect(record.unitPrice).toEqual(new Money(10));
    expect(record.netTransactionValue).toEqual(new Money(-100));
  });

  it('BUY: derives missing units', () => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    const record = parseTransactionRecord(
      7,
      ['BUY', new Date('2024-01-01'), 'ABC', '', '', 10, -100],
      indices,
    );

    expect(record.valueMode).toBe('components');
    expect(record.units).toEqual(new Shares(10));
    expect(record.unitPrice).toEqual(new Money(10));
    expect(record.netTransactionValue).toEqual(new Money(-100));
  });

  it('NCDIS: accepts NTV without units or price', () => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    const record = parseTransactionRecord(
      7,
      ['NCDIS', new Date('2024-01-01'), 'ABC', '', '', '', 100],
      indices,
    );

    expect(record.valueMode).toBe('netOnly');
    expect(record.netTransactionValue).toEqual(new Money(100));
    expect(record.units).toBeUndefined();
  });

  it('ROC: derives missing NTV', () => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    const record = parseTransactionRecord(
      7,
      ['ROC', new Date('2024-01-01'), 'ABC', 10, '', 10, ''],
      indices,
    );

    expect(record.valueMode).toBe('components');
    expect(record.units).toEqual(new Shares(10));
    expect(record.unitPrice).toEqual(new Money(10));
    expect(record.netTransactionValue).toEqual(new Money(100));
  });
});

describe('Transfer normalization', () => {
  it.each(['TRF_IN', 'TRF_OUT'])(
    '%s: preserves fees and metadata while deferring valuation',
    (type) => {
      const indices = calculateColumnIndices([
        'Type',
        'Date',
        'Ticker',
        'Units',
        'Fees',
        'Unit Price',
        'Net Transaction Value',
      ]);
      const record = parseTransactionRecord(
        7,
        [type, new Date('2024-01-01'), 'ABC', 1.25, 2, null, '  '],
        indices,
      );

      expect(record).toEqual({
        row: 7,
        date: new Date('2024-01-01'),
        ticker: 'ABC',
        type,
        valueMode: 'potentiallyInferrable',
        units: new Shares(1.25),
        fees: new Money(2),
      });
      expect(record).not.toHaveProperty('unitPrice');
      expect(record).not.toHaveProperty('netTransactionValue');
    },
  );

  it('TRF_IN: treats zero unit price as supplied value data', () => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    const record = parseTransactionRecord(
      7,
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', 0, ''],
      indices,
    );

    expect(record.valueMode).toBe('components');
    expect(record.unitPrice).toEqual(new Money(0));
    expect(record.netTransactionValue).toEqual(new Money(0));
  });

  it('TRF_IN: treats zero NTV as supplied value data', () => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    const record = parseTransactionRecord(
      7,
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', '', 0],
      indices,
    );

    expect(record.valueMode).toBe('components');
    expect(record.unitPrice).toEqual(new Money(0));
    expect(record.netTransactionValue).toEqual(new Money(0));
  });

  it.each([
    { type: 'TRF_OUT', fees: 5, ntv: -95 },
    { type: 'TRF_IN', fees: 2, ntv: 102 },
  ])('$type: validates supplied fee-inclusive NTV', ({ type, fees, ntv }) => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    const record = parseTransactionRecord(
      7,
      [type, new Date('2024-01-01'), 'ABC', 10, fees, 10, ntv],
      indices,
    );

    expect(record.valueMode).toBe('components');
    expect(record.units).toEqual(new Shares(10));
    expect(record.unitPrice).toEqual(new Money(10));
    expect(record.netTransactionValue).toEqual(new Money(ntv));
    expect(record.fees).toEqual(new Money(fees));
  });

  it.each([
    { type: 'TRF_OUT', fees: 5, ntv: -95 },
    { type: 'TRF_IN', fees: 2, ntv: 102 },
  ])('$type: adds fees when deriving NTV', ({ type, fees, ntv }) => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    const record = parseTransactionRecord(
      7,
      [type, new Date('2024-01-01'), 'ABC', 10, fees, 10, ''],
      indices,
    );

    expect(record.valueMode).toBe('components');
    expect(record.units).toEqual(new Shares(10));
    expect(record.unitPrice).toEqual(new Money(10));
    expect(record.netTransactionValue).toEqual(new Money(ntv));
    expect(record.fees).toEqual(new Money(fees));
  });

  it.each([
    { type: 'TRF_OUT', fees: 5, ntv: -95 },
    { type: 'TRF_IN', fees: 2, ntv: 102 },
  ])('$type: accounts for fees when deriving price', ({ type, fees, ntv }) => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    const record = parseTransactionRecord(
      7,
      [type, new Date('2024-01-01'), 'ABC', 10, fees, '', ntv],
      indices,
    );

    expect(record.valueMode).toBe('components');
    expect(record.units).toEqual(new Shares(10));
    expect(record.unitPrice).toEqual(new Money(10));
    expect(record.netTransactionValue).toEqual(new Money(ntv));
    expect(record.fees).toEqual(new Money(fees));
  });

  it.each([
    { type: 'TRF_OUT', fees: 5, ntv: -95 },
    { type: 'TRF_IN', fees: 2, ntv: 102 },
  ])('$type: accounts for fees when deriving units', ({ type, fees, ntv }) => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);
    const record = parseTransactionRecord(
      7,
      [type, new Date('2024-01-01'), 'ABC', '', fees, 10, ntv],
      indices,
    );

    expect(record.valueMode).toBe('components');
    expect(record.units).toEqual(new Shares(10));
    expect(record.unitPrice).toEqual(new Money(10));
    expect(record.netTransactionValue).toEqual(new Money(ntv));
    expect(record.fees).toEqual(new Money(fees));
  });

  it.each([
    { type: 'TRF_OUT', fees: 5, ntv: -105 },
    { type: 'TRF_IN', fees: 2, ntv: 98 },
  ])('$type: rejects NTV that subtracts fees', ({ type, fees, ntv }) => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);

    expect(() =>
      parseTransactionRecord(7, [type, new Date('2024-01-01'), 'ABC', 10, fees, 10, ntv], indices),
    ).toThrow(/^\[row: 7\]: Failed to parse the transaction record[\s\S]*did not match expected/);
  });

  it('TRF_IN: rejects NTV that subtracts fees', () => {
    const indices = calculateColumnIndices([
      'Type',
      'Date',
      'Ticker',
      'Units',
      'Fees',
      'Unit Price',
      'Net Transaction Value',
    ]);

    expect(() =>
      parseTransactionRecord(7, ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 2, 10, 98], indices),
    ).toThrow(/^\[row: 7\]: Failed to parse the transaction record[\s\S]*did not match expected/);
  });
});

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
      units: new Shares(10),
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
    expect(record.units).toEqual(new Shares(1234.5));
    expect(record.unitPrice).toEqual(new Money(1000));
    expect(record.fees).toEqual(new Money(0.25));
    expect(record.netTransactionValue).toEqual(new Money(-1234500.25));
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
    expect(record.unitPrice).toEqual(new Money(10));
    expect(record.fees).toEqual(new Money(1));
    expect(record.netTransactionValue).toEqual(new Money(-21));
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

    expect(record.netTransactionValue).toEqual(new Money(-101));
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
    expect(record.unitPrice).toEqual(new Money(10));
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
    expect(record.units).toEqual(new Shares(10));
  });

  it('accepts net-only transactions for ROC', () => {
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
    expect(record.netTransactionValue).toEqual(new Money(12.5));
  });

  it('allows NCDIS to carry components and computes NTV', () => {
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
    expect(record.netTransactionValue).toEqual(new Money(6));
  });

  it('rejects net-only BUY transactions', () => {
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
    expect(record.netTransactionValue).toEqual(new Money(-100));
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
