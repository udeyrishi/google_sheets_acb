import { calculateColumnIndices, parseTransactionRecord } from './parser';
import { calculateAggregates, calculatePendingGainsByTicker } from './aggregation';
import type { SheetRow, SheetTable } from './g_sheet_types';
import { Shares } from './shares';
import { zipArrays } from './utils';

/**
 * Calculates the ACB per unit for a ticker.
 * @param {string} ticker The ticker symbol to report (e.g., "TSE:VEQT").
 * @param {SheetTable} data Transaction table including a header row.
 * @return {number} ACB per unit for the specified ticker.
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
 * Calculates the total units owned for a ticker at the end of the dataset.
 * @param {string} ticker The ticker symbol to report (e.g., "TSE:VEQT").
 * @param {SheetTable} data Transaction table including a header row.
 * @return {number} Total units owned for the ticker.
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
 * Generates a report of all tickers with units owned.
 * @param {SheetTable} data Transaction table including a header row.
 * @return {SheetTable} Rows of [Ticker, Units Owned, ACB, ACB Per Unit, Pending Capital Gain (CY)].
 * @customfunction
 */
export function ASSET_REPORT(data: SheetTable): SheetTable {
  const filledData = data.filter((row: SheetRow) => row.findIndex((col) => Boolean(col)) >= 0);

  const columnIndices = calculateColumnIndices(filledData[0]);

  const transactions = filledData
    .slice(1)
    .map((row: SheetRow, i: number) => parseTransactionRecord(i + 2, row, columnIndices));

  const { aggregates, effects } = calculateAggregates(transactions);
  const currentYear = new Date().getFullYear();
  const pendingGainsByTicker = calculatePendingGainsByTicker(
    zipArrays(transactions, effects),
    currentYear,
  );

  const aggregatedTable = [...Object.entries(aggregates)]
    .filter(([_ticker, aggregated]) => aggregated.unitsOwned.gt(Shares.zero()))
    .map(([ticker, aggregated]) => {
      const acbPerUnit = aggregated.totalCost.divide(aggregated.unitsOwned.valueOf());
      const pendingGain = pendingGainsByTicker[ticker];
      return [
        ticker,
        {
          ...aggregated,
          acbPerUnit,
          pendingGain,
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
      ([ticker, { unitsOwned, totalCost, acbPerUnit, pendingGain }]) =>
        [
          ticker,
          unitsOwned.valueOf(),
          totalCost.valueOf(),
          acbPerUnit.valueOf(),
          pendingGain?.valueOf() ?? 0,
        ] as const,
    );

  const titleColumn = ['Ticker', 'Units Owned', 'ACB', 'ACB Per Unit', 'Pending Capital Gain (CY)'];
  return [titleColumn, ...aggregatedTable];
}

/**
 * Generates per-transaction effects with global ACB values.
 * @param {SheetTable} data Transaction table including a header row.
 * @return {SheetTable} Rows of [ACB, ACB Per Unit, Total Units Owned, Gain].
 * @customfunction
 */
export function TRANSACTION_EFFECTS(data: SheetTable): SheetTable {
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
