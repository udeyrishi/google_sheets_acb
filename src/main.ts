import { calculateColumnIndices, parseTransactionRecord } from './parser';
import { calculateAggregates } from './aggregation';
import type { SheetRow, SheetTable } from './g_sheet_types';
import { Shares } from './shares';

/**
 * Calculates the ACB per unit.
 * @param {ticker} The ticker whose ACB per unit needs to be calculated.
 * @param {data} The transaction dataset.
 * @return The ACB per unit for the specified ticker given the data
 * @customfunction
 */
export function ACB_UNIT(ticker: string, data: SheetTable): number {
  const columnIndices = calculateColumnIndices(data[0]);

  const transactions = data
    .slice(1)
    .map((row, i) => parseTransactionRecord(i + 2, row, columnIndices));

  const { aggregates } = calculateAggregates(transactions);
  const aggregated = aggregates[ticker];

  return aggregated.unitsOwned.gt(Shares.zero())
    ? aggregated.totalCost.divide(aggregated.unitsOwned.valueOf()).valueOf()
    : 0;
}

/**
 * Calculates the total units owned of the specified ticker at the end of the transaction dataset.
 * @param {ticker} The ticker whose count needs to be calculated.
 * @param {data} The transaction dataset.
 * @return The total units owned for the ticker
 * @customfunction
 */
export function UNITS_OWNED(ticker: string, data: SheetTable): number {
  const columnIndices = calculateColumnIndices(data[0]);

  const transactions = data
    .slice(1)
    .map((row, i) => parseTransactionRecord(i + 2, row, columnIndices));

  const { aggregates } = calculateAggregates(transactions);
  const aggregated = aggregates[ticker];

  return aggregated.unitsOwned.valueOf();
}

/**
 * Calculates the full current report for all assets in the dataset
 */
export function ASSET_REPORT(data: SheetTable): SheetTable {
  const filledData = data.filter((row: SheetRow) => row.findIndex((col) => Boolean(col)) >= 0);

  const columnIndices = calculateColumnIndices(filledData[0]);

  const transactions = filledData
    .slice(1)
    .map((row: SheetRow, i: number) => parseTransactionRecord(i + 2, row, columnIndices));

  const aggregatedTable = [...Object.entries(calculateAggregates(transactions).aggregates)]
    .filter(([_ticker, aggregated]) => aggregated.unitsOwned.gt(Shares.zero()))
    .map(([ticker, aggregated]) => {
      const acbPerUnit = aggregated.totalCost.divide(aggregated.unitsOwned.valueOf());
      return [
        ticker,
        {
          ...aggregated,
          acbPerUnit,
        },
      ] as const;
    })
    .sort(([ticker1], [ticker2]) => {
      if (ticker1 === ticker2) {
        return 0;
      } else if (ticker1 < ticker2) {
        return -1;
      } else {
        return 1;
      }
    })
    .map(
      ([ticker, { unitsOwned, totalCost, acbPerUnit }]) =>
        [ticker, unitsOwned.valueOf(), totalCost.valueOf(), acbPerUnit.valueOf()] as const,
    );

  const titleColumn = ['Ticker', 'Units Owned', 'ACB', 'ACB Per Unit'];
  return [titleColumn, ...aggregatedTable];
}

export function TRANSACTION_EFFECTS(data: SheetTable) {
  const filledData = data.filter((row) => row.findIndex((col) => Boolean(col)) >= 0);

  const columnIndices = calculateColumnIndices(filledData[0]);

  const transactions = filledData
    .slice(1)
    .map((row, i) => parseTransactionRecord(i + 2, row, columnIndices));

  const { effects } = calculateAggregates(transactions);
  const titleColumn = ['ACB', 'ACB Per Unit', 'Total Units Owned', 'Gain'];
  const formattedTable = effects.map(({ unitsOwned, totalCost, gain }) => {
    return [
      totalCost.valueOf(),
      unitsOwned.gt(Shares.zero()) ? totalCost.divide(unitsOwned.valueOf()).valueOf() : 0,
      unitsOwned.valueOf(),
      gain?.valueOf(),
    ];
  });

  return [titleColumn, ...formattedTable];
}
