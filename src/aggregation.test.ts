import { calculateAggregates } from './aggregation';
import type {
  Money,
  NetValueOnlyTransactionType,
  Ticker,
  TransactionRecord,
  TransactionRecordNetOnly,
  TransactionRecordWithComponents,
  TransactionType,
} from './transaction_record';

describe('calculateAggregates', () => {
  function txComponents({
    row,
    type,
    date,
    ticker = 'TSE:AAA',
    units,
    unitPrice = 0,
    fees = 0,
    netTransactionValue,
  }: {
    row: number;
    type: TransactionType;
    date: Date;
    ticker?: Ticker;
    units: number;
    unitPrice?: Money;
    fees?: Money;
    netTransactionValue?: Money;
  }): TransactionRecordWithComponents {
    const NET_VALUE_SIGN_BY_TYPE: Partial<Record<TransactionType, number>> = {
      TRF_IN: 1,
      SELL: 1,
      STK_RWD: 1,
      BUY: -1,
      DRIP: -1,
      TRF_OUT: -1,
    };

    const sign = NET_VALUE_SIGN_BY_TYPE[type] ?? 0;
    const computedNet =
      netTransactionValue ?? sign * units * unitPrice - (Number.isFinite(fees) ? fees : 0);

    return {
      row,
      type,
      date,
      ticker,
      units,
      unitPrice,
      fees,
      netTransactionValue: computedNet,
      valueMode: 'components',
    };
  }

  function txNetOnly({
    row,
    type,
    date,
    ticker = 'TSE:AAA',
    netTransactionValue,
  }: {
    row: number;
    type: NetValueOnlyTransactionType;
    date: Date;
    ticker?: Ticker;
    netTransactionValue: Money;
  }): TransactionRecordNetOnly {
    return {
      row,
      type,
      date,
      ticker,
      netTransactionValue,
      valueMode: 'netOnly',
      fees: 0,
    };
  }

  it('computes global ACB, units, and gains for buys and sells', () => {
    const transactions: TransactionRecord[] = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2021-05-20'), units: 10, unitPrice: 10 }),
      txComponents({ row: 3, type: 'BUY', date: new Date('2021-05-21'), units: 10, unitPrice: 12 }),
      txComponents({
        row: 4,
        type: 'SELL',
        date: new Date('2021-06-01'),
        units: 5,
        unitPrice: 15,
      }),
    ];

    const { aggregates, effects } = calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 20, totalCost: 220, gain: 0 },
      { unitsOwned: 15, totalCost: 165, gain: 20 },
    ]);
    expect(aggregates['TSE:AAA']).toEqual({ unitsOwned: 15, totalCost: 165 });
  });

  it('computes gain correctly on full disposals', () => {
    const transactions = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2021-05-20'), units: 10, unitPrice: 10 }),
      txComponents({
        row: 3,
        type: 'SELL',
        date: new Date('2021-06-01'),
        units: 10,
        unitPrice: 12,
      }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 0, totalCost: 0, gain: 20 },
    ]);
  });

  it('adds buy fees to total cost', () => {
    const transactions = [
      txComponents({
        row: 2,
        type: 'BUY',
        date: new Date('2022-01-01'),
        units: 10,
        unitPrice: 10,
        fees: 1,
      }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects).toEqual([{ unitsOwned: 10, totalCost: 101, gain: 0 }]);
  });

  it('reduces gains by sell fees', () => {
    const transactions = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
      txComponents({
        row: 3,
        type: 'SELL',
        date: new Date('2022-01-02'),
        units: 5,
        unitPrice: 12,
        fees: 3,
      }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects[1]).toEqual({ unitsOwned: 5, totalCost: 50, gain: 7 });
  });

  it('treats DRIP as a buy', () => {
    const transactions = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
      txComponents({ row: 3, type: 'DRIP', date: new Date('2022-01-02'), units: 2, unitPrice: 11 }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 12, totalCost: 122, gain: 0 },
    ]);
  });

  it('treats STK_RWD as units-only', () => {
    const transactions = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
      txComponents({ row: 3, type: 'STK_RWD', date: new Date('2022-01-02'), units: 3 }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 13, totalCost: 100, gain: 0 },
    ]);
  });

  it('applies non-cash distributions to ACB', () => {
    const transactions = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
      txNetOnly({ row: 3, type: 'NCDIS', date: new Date('2022-02-01'), netTransactionValue: 5 }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 10, totalCost: 105, gain: 0 },
    ]);
  });

  it('applies returns of capital to ACB', () => {
    const transactions = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
      txNetOnly({ row: 3, type: 'ROC', date: new Date('2022-02-01'), netTransactionValue: 2 }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 10, totalCost: 98, gain: 0 },
    ]);
  });

  it('ignores TRF_IN/TRF_OUT for global ACB', () => {
    const transactions = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
      txComponents({
        row: 3,
        type: 'TRF_OUT',
        date: new Date('2022-02-01'),
        units: 5,
        unitPrice: 10,
      }),
      txComponents({
        row: 4,
        type: 'TRF_IN',
        date: new Date('2022-02-02'),
        units: 5,
        unitPrice: 10,
      }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 5, totalCost: 50, gain: 0 },
      { unitsOwned: 10, totalCost: 100, gain: 0 },
    ]);
  });

  it('uses TRF_IN to seed ACB when no buys exist', () => {
    const transactions = [
      txComponents({
        row: 2,
        type: 'TRF_IN',
        date: new Date('2021-06-01'),
        units: 100,
        unitPrice: 151.07,
      }),
      txComponents({
        row: 3,
        type: 'SELL',
        date: new Date('2021-10-08'),
        units: 10,
        unitPrice: 177.5,
      }),
    ];

    const { effects, aggregates } = calculateAggregates(transactions);

    expect(effects[0]).toEqual({ unitsOwned: 100, totalCost: 15107, gain: 0 });
    expect(effects[1].unitsOwned).toBe(90);
    expect(effects[1].totalCost).toBeCloseTo(13596.3, 2);
    expect(effects[1].gain).toBeCloseTo(264.3, 2);
    expect(aggregates['TSE:AAA'].unitsOwned).toBe(90);
    expect(aggregates['TSE:AAA'].totalCost).toBeCloseTo(13596.3, 2);
  });

  it('processes a mixed sequence of transactions', () => {
    const transactions = [
      txComponents({
        row: 2,
        type: 'BUY',
        date: new Date('2022-01-01'),
        units: 10,
        unitPrice: 10,
        fees: 1,
      }),
      txComponents({
        row: 3,
        type: 'BUY',
        date: new Date('2022-01-02'),
        units: 5,
        unitPrice: 12,
        fees: 0,
      }),
      txComponents({
        row: 4,
        type: 'SELL',
        date: new Date('2022-01-03'),
        units: 3,
        unitPrice: 14,
        fees: 2,
      }),
      txNetOnly({ row: 5, type: 'NCDIS', date: new Date('2022-01-04'), netTransactionValue: 5 }),
      txNetOnly({ row: 6, type: 'ROC', date: new Date('2022-01-05'), netTransactionValue: 3 }),
      txComponents({ row: 7, type: 'DRIP', date: new Date('2022-01-06'), units: 2, unitPrice: 11 }),
    ];

    const { aggregates, effects } = calculateAggregates(transactions);

    // After SELL: ACB per unit before sale = 161 / 15 = 10.733333..., cost base = 32.2,
    // proceeds = (3 * 14) - 2 = 40, gain = 7.8, new total cost = 161 - 32.2 = 128.8.
    expect(effects[2].gain).toBeCloseTo(7.8, 6);
    expect(effects[2].totalCost).toBeCloseTo(128.8, 6);
    // After NCDIS: total cost + 5 = 133.8, units unchanged.
    expect(effects[3].unitsOwned).toBe(12);
    expect(effects[3].totalCost).toBeCloseTo(133.8, 6);
    expect(effects[3].gain).toBe(0);
    // After ROC: total cost - 3 = 130.8, units unchanged.
    expect(effects[4].unitsOwned).toBe(12);
    expect(effects[4].totalCost).toBeCloseTo(130.8, 6);
    expect(effects[4].gain).toBe(0);
    // Final after DRIP: add 2 * 11 = 22 to ACB, units + 2.
    expect(aggregates['TSE:AAA'].unitsOwned).toBe(14);
    expect(aggregates['TSE:AAA'].totalCost).toBeCloseTo(152.8, 6);
  });

  it('tracks aggregates independently for interleaved tickers', () => {
    const transactions = [
      txComponents({
        row: 2,
        type: 'BUY',
        date: new Date('2022-01-01'),
        ticker: 'TSE:AAA',
        units: 10,
        unitPrice: 10,
      }),
      txComponents({
        row: 3,
        type: 'BUY',
        date: new Date('2022-01-02'),
        ticker: 'TSE:BBB',
        units: 5,
        unitPrice: 20,
      }),
      txComponents({
        row: 4,
        type: 'SELL',
        date: new Date('2022-01-03'),
        ticker: 'TSE:AAA',
        units: 4,
        unitPrice: 12,
      }),
      txComponents({
        row: 5,
        type: 'DRIP',
        date: new Date('2022-01-04'),
        ticker: 'TSE:BBB',
        units: 1,
        unitPrice: 22,
      }),
    ];

    const { aggregates, effects } = calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 5, totalCost: 100, gain: 0 },
      { unitsOwned: 6, totalCost: 60, gain: 8 },
      { unitsOwned: 6, totalCost: 122, gain: 0 },
    ]);
    expect(aggregates).toEqual({
      'TSE:AAA': { unitsOwned: 6, totalCost: 60 },
      'TSE:BBB': { unitsOwned: 6, totalCost: 122 },
    });
  });

  it('computes gains per ticker without cross-contamination', () => {
    const transactions = [
      txComponents({
        row: 2,
        type: 'BUY',
        date: new Date('2022-01-01'),
        ticker: 'TSE:AAA',
        units: 10,
        unitPrice: 10,
      }),
      txComponents({
        row: 3,
        type: 'BUY',
        date: new Date('2022-01-02'),
        ticker: 'TSE:BBB',
        units: 10,
        unitPrice: 30,
      }),
      txComponents({
        row: 4,
        type: 'SELL',
        date: new Date('2022-01-03'),
        ticker: 'TSE:BBB',
        units: 4,
        unitPrice: 25,
      }),
      txComponents({
        row: 5,
        type: 'SELL',
        date: new Date('2022-01-04'),
        ticker: 'TSE:AAA',
        units: 4,
        unitPrice: 12,
      }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects).toEqual([
      { unitsOwned: 10, totalCost: 100, gain: 0 },
      { unitsOwned: 10, totalCost: 300, gain: 0 },
      { unitsOwned: 6, totalCost: 180, gain: -20 },
      { unitsOwned: 6, totalCost: 60, gain: 8 },
    ]);
  });

  it('rejects sells when starting with a sell', () => {
    expect(() =>
      calculateAggregates([
        txComponents({
          row: 2,
          type: 'SELL',
          date: new Date('2022-01-01'),
          units: 1,
          unitPrice: 10,
        }),
      ]),
    ).toThrow(/Cannot have a Sell transaction/);
  });

  it('rejects sells that exceed the units owned', () => {
    expect(() =>
      calculateAggregates([
        txComponents({
          row: 2,
          type: 'BUY',
          date: new Date('2022-01-01'),
          units: 2,
          unitPrice: 10,
        }),
        txComponents({
          row: 3,
          type: 'SELL',
          date: new Date('2022-01-02'),
          units: 3,
          unitPrice: 10,
        }),
      ]),
    ).toThrow(/Cannot sell more units than owned/);
  });

  it('rejects TRF_OUT when unit price does not match ACB per unit', () => {
    expect(() =>
      calculateAggregates([
        txComponents({
          row: 2,
          type: 'BUY',
          date: new Date('2022-01-01'),
          units: 10,
          unitPrice: 10,
        }),
        txComponents({
          row: 3,
          type: 'TRF_OUT',
          date: new Date('2022-01-02'),
          units: 5,
          unitPrice: 11,
        }),
      ]),
    ).toThrow(/unitPrice/);
  });

  it('rejects negative NCDIS values', () => {
    const base = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
    ];

    expect(() =>
      calculateAggregates([
        ...base,
        txNetOnly({ row: 3, type: 'NCDIS', date: new Date('2022-02-01'), netTransactionValue: -1 }),
      ]),
    ).toThrow(/Non-cash distributions/);
  });

  it('rejects negative ROC values', () => {
    const base = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
    ];

    expect(() =>
      calculateAggregates([
        ...base,
        txNetOnly({ row: 3, type: 'ROC', date: new Date('2022-02-01'), netTransactionValue: -1 }),
      ]),
    ).toThrow(/Returns of capital/);
  });

  it('rejects out-of-order dates', () => {
    expect(() =>
      calculateAggregates([
        txComponents({
          row: 2,
          type: 'BUY',
          date: new Date('2022-02-01'),
          units: 10,
          unitPrice: 10,
        }),
        txComponents({
          row: 3,
          type: 'BUY',
          date: new Date('2022-01-01'),
          units: 1,
          unitPrice: 10,
        }),
      ]),
    ).toThrow(/Transaction date is less/);
  });
});
