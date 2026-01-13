import { calculateAggregates, calculatePendingGainsByTicker } from './aggregation';
import type { PostTradeSnapshot, PortfolioPositions, PositionSnapshot } from './aggregation_types';
import { Money } from './money';
import { Shares } from './shares';
import type {
  NetValueOnlyTransactionType,
  Ticker,
  TransactionRecord,
  TransactionRecordNetOnly,
  TransactionRecordWithComponents,
  TransactionType,
} from './transaction_record';
import { zipArrays } from './utils';

const NET_VALUE_SIGN_BY_TYPE: Partial<Record<TransactionType, number>> = {
  TRF_IN: 1,
  SELL: 1,
  STK_RWD: 1,
  BUY: -1,
  DRIP: -1,
  TRF_OUT: -1,
};

function toMoney(value: Money | number | undefined): Money | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value instanceof Money) {
    return value;
  }
  return new Money(value);
}

function toShares(value: number): Shares {
  return new Shares(value);
}

function txComponents({
  row,
  type,
  date,
  ticker = 'TSE:AAA',
  units,
  unitPrice = 0,
  fees,
  netTransactionValue,
}: {
  row: number;
  type: TransactionType;
  date: Date;
  ticker?: Ticker;
  units: number;
  unitPrice?: Money | number;
  fees?: Money | number;
  netTransactionValue?: Money | number;
}): TransactionRecordWithComponents {
  const sign = NET_VALUE_SIGN_BY_TYPE[type] ?? 0;
  const unitPriceMoney = toMoney(unitPrice) ?? new Money(0);
  const feesMoney = toMoney(fees);
  const computedNet =
    netTransactionValue ??
    unitPriceMoney.multiply(units * sign).subtract(feesMoney ?? Money.zero());

  return {
    row,
    type,
    date,
    ticker,
    units: toShares(units),
    unitPrice: unitPriceMoney,
    fees: feesMoney,
    netTransactionValue: toMoney(computedNet),
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
  netTransactionValue: Money | number;
}): TransactionRecordNetOnly {
  return {
    row,
    type,
    date,
    ticker,
    netTransactionValue: toMoney(netTransactionValue),
    valueMode: 'netOnly',
  };
}

describe('calculateAggregates', () => {
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

    expect(effects).toEqual<readonly PostTradeSnapshot[]>([
      { unitsOwned: new Shares(10), totalCost: new Money(100) },
      { unitsOwned: new Shares(20), totalCost: new Money(220) },
      { unitsOwned: new Shares(15), totalCost: new Money(165), gain: new Money(20) },
    ]);
    expect(aggregates['TSE:AAA']).toEqual<PositionSnapshot>({
      unitsOwned: new Shares(15),
      totalCost: new Money(165),
    });
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

    expect(effects).toEqual<readonly PostTradeSnapshot[]>([
      { unitsOwned: new Shares(10), totalCost: new Money(100) },
      { unitsOwned: Shares.zero(), totalCost: Money.zero(), gain: new Money(20) },
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

    expect(effects).toEqual<readonly PostTradeSnapshot[]>([
      { unitsOwned: new Shares(10), totalCost: new Money(101) },
    ]);
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

    expect(effects[1]).toEqual<PostTradeSnapshot>({
      unitsOwned: new Shares(5),
      totalCost: new Money(50),
      gain: new Money(7),
    });
  });

  it('treats DRIP as a buy', () => {
    const transactions = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
      txComponents({ row: 3, type: 'DRIP', date: new Date('2022-01-02'), units: 2, unitPrice: 11 }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects).toEqual<readonly PostTradeSnapshot[]>([
      { unitsOwned: new Shares(10), totalCost: new Money(100) },
      { unitsOwned: new Shares(12), totalCost: new Money(122) },
    ]);
  });

  it('treats STK_RWD as units-only', () => {
    const transactions = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
      txComponents({ row: 3, type: 'STK_RWD', date: new Date('2022-01-02'), units: 3 }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects).toEqual<readonly PostTradeSnapshot[]>([
      { unitsOwned: new Shares(10), totalCost: new Money(100) },
      { unitsOwned: new Shares(13), totalCost: new Money(100) },
    ]);
  });

  it('applies non-cash distributions to ACB', () => {
    const transactions = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
      txNetOnly({ row: 3, type: 'NCDIS', date: new Date('2022-02-01'), netTransactionValue: 5 }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects).toEqual<readonly PostTradeSnapshot[]>([
      { unitsOwned: new Shares(10), totalCost: new Money(100) },
      { unitsOwned: new Shares(10), totalCost: new Money(105) },
    ]);
  });

  it('applies returns of capital to ACB', () => {
    const transactions = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
      txNetOnly({ row: 3, type: 'ROC', date: new Date('2022-02-01'), netTransactionValue: 2 }),
    ];

    const { effects } = calculateAggregates(transactions);

    expect(effects).toEqual<readonly PostTradeSnapshot[]>([
      { unitsOwned: new Shares(10), totalCost: new Money(100) },
      { unitsOwned: new Shares(10), totalCost: new Money(98) },
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

    expect(effects).toEqual<readonly PostTradeSnapshot[]>([
      { unitsOwned: new Shares(10), totalCost: new Money(100) },
      { unitsOwned: new Shares(5), totalCost: new Money(50) },
      { unitsOwned: new Shares(10), totalCost: new Money(100) },
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

    expect(effects[0]).toEqual<PostTradeSnapshot>({
      unitsOwned: new Shares(100),
      totalCost: new Money(15107),
    });
    expect(effects[1].unitsOwned).toEqual(new Shares(90));
    expect(effects[1].totalCost).toEqual(new Money(13596.3));
    expect(effects[1].gain).toEqual(new Money(264.3));
    expect(aggregates['TSE:AAA'].unitsOwned).toEqual(new Shares(90));
    expect(aggregates['TSE:AAA'].totalCost).toEqual(new Money(13596.3));
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
    expect(effects[2].gain).toEqual(new Money(7.8));
    expect(effects[2].totalCost).toEqual(new Money(128.8));
    // After NCDIS: total cost + 5 = 133.8, units unchanged.
    expect(effects[3].unitsOwned).toEqual(new Shares(12));
    expect(effects[3].totalCost).toEqual(new Money(133.8));
    expect(effects[3].gain).toBeUndefined();
    // After ROC: total cost - 3 = 130.8, units unchanged.
    expect(effects[4].unitsOwned).toEqual(new Shares(12));
    expect(effects[4].totalCost).toEqual(new Money(130.8));
    expect(effects[4].gain).toBeUndefined();
    // Final after DRIP: add 2 * 11 = 22 to ACB, units + 2.
    expect(aggregates['TSE:AAA'].unitsOwned).toEqual(new Shares(14));
    expect(aggregates['TSE:AAA'].totalCost).toEqual(new Money(152.8));
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

    expect(effects).toEqual<readonly PostTradeSnapshot[]>([
      { unitsOwned: new Shares(10), totalCost: new Money(100) },
      { unitsOwned: new Shares(5), totalCost: new Money(100) },
      { unitsOwned: new Shares(6), totalCost: new Money(60), gain: new Money(8) },
      { unitsOwned: new Shares(6), totalCost: new Money(122) },
    ]);
    expect(aggregates).toEqual<PortfolioPositions>({
      'TSE:AAA': { unitsOwned: new Shares(6), totalCost: new Money(60) },
      'TSE:BBB': { unitsOwned: new Shares(6), totalCost: new Money(122) },
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

    expect(effects).toEqual<readonly PostTradeSnapshot[]>([
      { unitsOwned: new Shares(10), totalCost: new Money(100) },
      { unitsOwned: new Shares(10), totalCost: new Money(300) },
      { unitsOwned: new Shares(6), totalCost: new Money(180), gain: new Money(-20) },
      { unitsOwned: new Shares(6), totalCost: new Money(60), gain: new Money(8) },
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

describe('calculatePendingGainsByTicker', () => {
  it('sums sell gains per ticker for the requested year', () => {
    const transactions: TransactionRecord[] = [
      txComponents({ row: 2, type: 'BUY', date: new Date('2022-01-01'), units: 10, unitPrice: 10 }),
      txComponents({
        row: 3,
        type: 'SELL',
        date: new Date('2022-02-01'),
        units: 5,
        unitPrice: 12,
      }),
      txComponents({
        row: 4,
        type: 'BUY',
        date: new Date('2022-02-15'),
        ticker: 'TSE:BBB',
        units: 4,
        unitPrice: 20,
      }),
      txComponents({
        row: 5,
        type: 'SELL',
        date: new Date('2022-03-01'),
        ticker: 'TSE:BBB',
        units: 4,
        unitPrice: 18,
      }),
      txNetOnly({ row: 6, type: 'NCDIS', date: new Date('2022-04-01'), netTransactionValue: 5 }),
      txComponents({
        row: 7,
        type: 'SELL',
        date: new Date('2023-01-01'),
        units: 1,
        unitPrice: 11,
      }),
    ];

    const { effects } = calculateAggregates(transactions);
    const pending = calculatePendingGainsByTicker(zipArrays(transactions, effects), 2022);

    expect(pending['TSE:AAA']).toEqual(new Money(10));
    expect(pending['TSE:BBB']).toEqual(new Money(-8));
    expect(pending['TSE:CCC']).toBeUndefined();
  });
});
