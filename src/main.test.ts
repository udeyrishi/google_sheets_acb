import { ACB_UNIT, UNITS_OWNED, UNITS_OWNED_ON, TRANSACTION_EFFECTS, ASSET_REPORT } from './main';

describe('UNITS_OWNED_ON', () => {
  const header = [
    'Type',
    'Date',
    'Ticker',
    'Account',
    'Units',
    'Fees',
    'Unit Price',
    'Net Transaction Value',
  ];
  const data = [
    header,
    ['BUY', new Date('2024-01-01'), 'ABC', 'Broker A', 10, 0, 2, -20],
    ['BUY', new Date('2024-01-02'), 'XYZ', 'Broker A', 100, 0, 2, -200],
    ['BUY', new Date('2024-01-03'), 'ABC', 'Broker B', 5, 0, 2, -10],
    ['SELL', new Date('2024-01-03'), 'ABC', 'Broker A', 3, 0, 2, 6],
    ['SELL', new Date('2024-01-05'), 'ABC', 'Broker B', 12, 0, 2, 24],
  ];

  it.each([
    ['2023-12-31', 0],
    ['2024-01-01', 10],
    ['2024-01-03', 12],
    ['2024-01-04', 12],
    ['2024-01-05', 0],
    ['2024-02-01', 0],
  ])('returns holdings across accounts as of %s', (date, expected) => {
    expect(UNITS_OWNED_ON('ABC', new Date(date), data)).toBe(expected);
  });

  it('returns zero for an unknown ticker', () => {
    expect(UNITS_OWNED_ON('UNKNOWN', new Date('2024-01-03'), data)).toBe(0);
  });

  it('returns zero for a header-only table', () => {
    expect(UNITS_OWNED_ON('ABC', new Date('2024-01-03'), [header])).toBe(0);
  });

  it('ignores blank rows before, between, and after transactions', () => {
    const paddedData = [[], header, data[1], ['', '', '', ''], ...data.slice(2), []];
    expect(UNITS_OWNED_ON('ABC', new Date('2024-01-03'), paddedData)).toBe(12);
  });

  it('uses an inclusive timestamp cutoff without rounding to the end of the day', () => {
    const timedData = [
      header,
      ['BUY', new Date('2024-01-01T00:00:00Z'), 'ABC', 'Broker A', 1, 0, 2, -2],
      ['BUY', new Date('2024-01-01T12:00:00Z'), 'ABC', 'Broker A', 2, 0, 2, -4],
    ];
    expect(UNITS_OWNED_ON('ABC', new Date('2024-01-01T00:00:00Z'), timedData)).toBe(1);
    expect(UNITS_OWNED_ON('ABC', new Date('2024-01-01T12:00:00Z'), timedData)).toBe(3);
  });

  it('preserves fractional units from purchases and reinvestments', () => {
    const fractionalData = [
      header,
      ['BUY', new Date('2024-01-01'), 'ABC', 'Broker A', 0.1, 0, 10, -1],
      ['DRIP', new Date('2024-01-02'), 'ABC', 'Broker A', 0.2, 0, 10, -2],
      ['SELL', new Date('2024-01-03'), 'ABC', 'Broker A', 0.1, 0, 10, 1],
    ];
    expect(UNITS_OWNED_ON('ABC', new Date('2024-01-02'), fractionalData)).toBeCloseTo(0.3, 10);
    expect(UNITS_OWNED_ON('ABC', new Date('2024-01-03'), fractionalData)).toBeCloseTo(0.2, 10);
  });

  it.each(['ABC', 'XYZ'])('rejects out-of-order rows for %s even after the cutoff', (ticker) => {
    const unsortedData = [
      header,
      data[1],
      ['BUY', new Date('2024-02-02'), ticker, 'Broker A', 1, 0, 2, -2],
      ['BUY', new Date('2024-02-01'), ticker, 'Broker A', 1, 0, 2, -2],
    ];
    expect(() => UNITS_OWNED_ON('ABC', new Date('2024-01-01'), unsortedData)).toThrow(
      '[4]: Transaction date is less than the previous transaction date',
    );
  });

  it('validates transaction rows outside the requested ticker and cutoff', () => {
    const invalidData = [
      header,
      data[1],
      ['INVALID', new Date('2024-02-01'), 'XYZ', 'Broker A', 1, 0, 2, -2],
    ];
    expect(() => UNITS_OWNED_ON('ABC', new Date('2024-01-01'), invalidData)).toThrow(
      'Unknown transaction type: INVALID',
    );
  });

  it('propagates aggregation errors for transactions included at the cutoff', () => {
    const oversellData = [
      header,
      data[1],
      ['SELL', new Date('2024-01-02'), 'ABC', 'Broker A', 11, 0, 2, 22],
    ];
    expect(() => UNITS_OWNED_ON('ABC', new Date('2024-01-02'), oversellData)).toThrow(
      'Cannot sell more units than owned.',
    );
  });
});

describe('ACB calculations', () => {
  it('calculates ACB per unit for a single buy', () => {
    const data = [
      ['Date', 'Ticker', 'Type', 'Account', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      [new Date('2024-01-01'), 'ABC', 'BUY', 'Taxable', 10, 2, 1, -21],
    ];

    expect(UNITS_OWNED('ABC', data)).toBe(10);
    expect(ACB_UNIT('ABC', data)).toBeCloseTo(2.1, 6);
  });
});

describe('Transaction effects and reports', () => {
  const data = [
    ['Type', 'Date', 'Ticker', 'Account', 'Units', 'Fees', 'Unit Price', 'Net Transaction Value'],
    ['BUY', new Date('2021-05-20'), 'TSE:VEQT', 'Wealthsimple', 10, 0, 10, -100],
    ['BUY', new Date('2021-05-20'), 'TSE:VEQT', 'Questrade', 10, 0, 12, -120],
    ['SELL', new Date('2021-06-01'), 'TSE:VEQT', 'Wealthsimple', 5, 0, 15, 75],
  ];

  it('emits global effects for each transaction', () => {
    const effects = TRANSACTION_EFFECTS(data);

    expect(effects[0]).toEqual([
      'ACB Change',
      'Resulting ACB',
      'Resulting ACB Per Unit',
      'Resulting Units Owned',
      'Gain',
    ]);
    expect(effects[1]).toEqual([100, 100, 10, 10, undefined]);
    expect(effects[2]).toEqual([120, 220, 11, 20, undefined]);
    expect(effects[3]).toEqual([-55, 165, 11, 15, 20]);
  });

  it('computes gain from the pre-sell global ACB on full disposals', () => {
    const fullSellData = [
      ['Type', 'Date', 'Ticker', 'Account', 'Units', 'Fees', 'Unit Price', 'Net Transaction Value'],
      ['BUY', new Date('2021-05-20'), 'TSE:AAA', 'Wealthsimple', 10, 0, 10, -100],
      ['SELL', new Date('2021-06-01'), 'TSE:AAA', 'Wealthsimple', 10, 0, 12, 120],
    ];

    const effects = TRANSACTION_EFFECTS(fullSellData);

    expect(effects[0]).toEqual([
      'ACB Change',
      'Resulting ACB',
      'Resulting ACB Per Unit',
      'Resulting Units Owned',
      'Gain',
    ]);
    expect(effects[1]).toEqual([100, 100, 10, 10, undefined]);
    expect(effects[2]).toEqual([-100, 0, 0, 0, 20]);
  });

  it('reports global aggregates in asset report', () => {
    const report = ASSET_REPORT(data);

    expect(report[0]).toEqual(['Ticker', 'Units Owned', 'ACB', 'ACB Per Unit']);
    expect(report[1][0]).toBe('TSE:VEQT');
    expect(report[1][1]).toBe(15);
    expect(report[1][2]).toBe(165);
    expect(report[1][3]).toBeCloseTo(165 / 15, 6);
  });
});
