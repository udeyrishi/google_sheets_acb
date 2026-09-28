import { calculateColumnIndices, parseTransactionRecord } from './parser';
import { calculateAggregates } from './aggregation';
import type { SheetRow, SheetTable } from './g_sheet_types';
import { Shares } from './shares';

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
 * Calculates total units owned across accounts, optionally before a given date.
 * Blank rows are ignored with or without a date. The entire remaining table is parsed
 * and checked for chronological order before filtering by an optional exclusive timestamp cutoff.
 * @param {string} ticker The ticker symbol to report (e.g., "TSE:VEQT").
 * @param {SheetTable} data Transaction table including a header row, in chronological order.
 * @param {Date} [date] Optional exclusive cutoff as a Sheets date cell or DATE formula.
 * @return {number} Units owned at the end of the dataset, or strictly before the cutoff when provided.
 * Returns zero if no matching transactions exist.
 * @throws {Error} If the table contains invalid or out-of-order transactions, or aggregation fails.
 * @customfunction
 */
export function UNITS_OWNED(ticker: string, data: SheetTable, date?: Date): number {
  const filledData = data.filter((row) => row.findIndex((col) => Boolean(col)) >= 0);
  const columnIndices = calculateColumnIndices(filledData[0]);

  const transactions = filledData
    .slice(1)
    .map((row, i) => parseTransactionRecord(i + 2, row, columnIndices));

  return (
    calculateAggregates(transactions, { ticker, date }).aggregates[ticker]?.unitsOwned.valueOf() ??
    0
  );
}

/**
 * Generates a report of all tickers with units owned.
 * @param {SheetTable} data Transaction table including a header row.
 * @return {SheetTable} Rows of [Ticker, Units Owned, ACB, ACB Per Unit].
 * @customfunction
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

/**
 * Generates per-transaction effects with global ACB values.
 * @param {SheetTable} data Transaction table including a header row.
 * @return {SheetTable} Rows of [ACB Change, Resulting ACB, Resulting ACB Per Unit, Resulting Units Owned, Gain].
 * @customfunction
 */
export function TRANSACTION_EFFECTS(data: SheetTable): SheetTable {
  const filledData = data.filter((row) => row.findIndex((col) => Boolean(col)) >= 0);

  const columnIndices = calculateColumnIndices(filledData[0]);

  const transactions = filledData
    .slice(1)
    .map((row, i) => parseTransactionRecord(i + 2, row, columnIndices));

  const { effects } = calculateAggregates(transactions);
  const titleColumn = [
    'ACB Change',
    'Resulting ACB',
    'Resulting ACB Per Unit',
    'Resulting Units Owned',
    'Gain',
  ];
  const formattedTable = effects.map(({ totalCostChange, unitsOwned, totalCost, gain }) => {
    return [
      totalCostChange.valueOf(),
      totalCost.valueOf(),
      unitsOwned.gt(Shares.zero()) ? totalCost.divide(unitsOwned.valueOf()).valueOf() : 0,
      unitsOwned.valueOf(),
      gain?.valueOf(),
    ];
  });

  return [titleColumn, ...formattedTable];
}
