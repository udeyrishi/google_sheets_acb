import { ACB_UNIT, UNITS_OWNED, TRANSACTION_EFFECTS, ASSET_REPORT } from './main';

describe('Transfer fees', () => {
  const header = ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'];

  it.each([
    ['all components', 10, 10, -95, 102],
    ['derived NTV', 10, 10, '', ''],
    ['derived price', 10, '', -95, 102],
    ['derived units', '', 10, -95, 102],
  ])('adds both fees to ACB for a full transfer with %s', (_label, units, price, outNtv, inNtv) => {
    const data = [
      header,
      ['BUY', new Date('2024-01-01'), 'ABC', 10, 10, 0, -100],
      ['TRF_OUT', new Date('2024-01-02'), 'ABC', units, price, 5, outNtv],
      ['TRF_IN', new Date('2024-01-03'), 'ABC', units, price, 2, inNtv],
    ];

    const effects = TRANSACTION_EFFECTS(data);
    expect(effects[2]).toEqual([-95, 5, 0, 0, undefined]);
    expect(effects[3]).toEqual([102, 107, 10.7, 10, undefined]);
    expect(ACB_UNIT('ABC', data)).toBe(10.7);
    expect(UNITS_OWNED('ABC', data)).toBe(10);
  });

  it('capitalizes fees on an explicitly valued seed transfer', () => {
    const data = [header, ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, 2, 102]];
    expect(TRANSACTION_EFFECTS(data)[1]).toEqual([102, 102, 10.2, 10, undefined]);
  });
});

describe('UNITS_OWNED', () => {
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

  it('uses the full dataset when the date is omitted or undefined', () => {
    const openPositionData = data.slice(0, -1);
    expect(UNITS_OWNED('ABC', openPositionData)).toBe(12);
    expect(UNITS_OWNED('ABC', openPositionData, undefined)).toBe(12);
    expect(UNITS_OWNED('ABC', openPositionData, new Date('2024-01-01'))).toBe(0);
    expect(UNITS_OWNED('ABC', data)).toBe(0);
  });

  it.each([
    ['2023-12-31', 0],
    ['2024-01-01', 0],
    ['2024-01-03', 10],
    ['2024-01-04', 12],
    ['2024-01-05', 12],
    ['2024-02-01', 0],
  ])('returns holdings across accounts strictly before %s', (date, expected) => {
    expect(UNITS_OWNED('ABC', data, new Date(date))).toBe(expected);
  });

  it('returns zero for an unknown ticker', () => {
    expect(UNITS_OWNED('UNKNOWN', data)).toBe(0);
    expect(UNITS_OWNED('UNKNOWN', data, new Date('2024-01-03'))).toBe(0);
  });

  it('returns zero for a header-only table', () => {
    expect(UNITS_OWNED('ABC', [header])).toBe(0);
    expect(UNITS_OWNED('ABC', [header], new Date('2024-01-03'))).toBe(0);
  });

  it('ignores blank rows before, between, and after transactions', () => {
    const paddedData = [
      [],
      header,
      data[1],
      ['', '', '', ''],
      ...data.slice(2, -1),
      ['', '', '', '', '', '', '', ''],
      [],
    ];
    expect(UNITS_OWNED('ABC', paddedData)).toBe(12);
    expect(UNITS_OWNED('ABC', paddedData, undefined)).toBe(12);
    expect(UNITS_OWNED('ABC', paddedData, new Date('2024-01-03'))).toBe(10);
    expect(UNITS_OWNED('ABC', paddedData, new Date('2024-01-01'))).toBe(0);
  });

  it('excludes transactions exactly at the cutoff and includes those just before it', () => {
    const timedData = [
      header,
      ['BUY', new Date('2024-01-01T00:00:00Z'), 'ABC', 'Broker A', 1, 0, 2, -2],
      ['BUY', new Date('2024-01-01T12:00:00Z'), 'ABC', 'Broker A', 2, 0, 2, -4],
    ];
    expect(UNITS_OWNED('ABC', timedData, new Date('2024-01-01T00:00:00Z'))).toBe(0);
    expect(UNITS_OWNED('ABC', timedData, new Date('2024-01-01T12:00:00Z'))).toBe(1);
    expect(UNITS_OWNED('ABC', timedData, new Date('2024-01-01T12:00:00.001Z'))).toBe(3);
  });

  it('preserves fractional units from purchases and reinvestments', () => {
    const fractionalData = [
      header,
      ['BUY', new Date('2024-01-01'), 'ABC', 'Broker A', 0.1, 0, 10, -1],
      ['DRIP', new Date('2024-01-02'), 'ABC', 'Broker A', 0.2, 0, 10, -2],
      ['SELL', new Date('2024-01-03'), 'ABC', 'Broker A', 0.1, 0, 10, 1],
    ];
    expect(UNITS_OWNED('ABC', fractionalData, new Date('2024-01-02'))).toBeCloseTo(0.1, 10);
    expect(UNITS_OWNED('ABC', fractionalData, new Date('2024-01-03'))).toBeCloseTo(0.3, 10);
    expect(UNITS_OWNED('ABC', fractionalData, new Date('2024-01-04'))).toBeCloseTo(0.2, 10);
  });

  it.each(['ABC', 'XYZ'])('rejects out-of-order rows for %s even after the cutoff', (ticker) => {
    const unsortedData = [
      header,
      data[1],
      ['BUY', new Date('2024-02-02'), ticker, 'Broker A', 1, 0, 2, -2],
      ['BUY', new Date('2024-02-01'), ticker, 'Broker A', 1, 0, 2, -2],
    ];
    expect(() => UNITS_OWNED('ABC', unsortedData, new Date('2024-01-01'))).toThrow(
      '[4]: Transaction date is less than the previous transaction date',
    );
  });

  it('validates transaction rows outside the requested ticker and cutoff', () => {
    const invalidData = [
      header,
      data[1],
      ['INVALID', new Date('2024-02-01'), 'XYZ', 'Broker A', 1, 0, 2, -2],
    ];
    expect(() => UNITS_OWNED('ABC', invalidData, new Date('2024-01-01'))).toThrow(
      'Unknown transaction type: INVALID',
    );
  });

  it('propagates aggregation errors only for transactions before the cutoff', () => {
    const oversellData = [
      header,
      data[1],
      ['SELL', new Date('2024-01-02'), 'ABC', 'Broker A', 11, 0, 2, 22],
    ];
    expect(UNITS_OWNED('ABC', oversellData, new Date('2024-01-02'))).toBe(10);
    expect(() => UNITS_OWNED('ABC', oversellData, new Date('2024-01-03'))).toThrow(
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
