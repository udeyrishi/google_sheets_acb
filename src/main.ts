import { _calculateColumnIndices, _parseTransactionRecord } from "./parser";
import { _calculateAggregates } from "./aggregation";

/**
 * Calculates the ACB per unit.
 * @param {ticker} The ticker whose ACB per unit needs to be calculated.
 * @param {data} The transaction dataset.
 * @return The ACB per unit for the specified ticker given the data
 * @customfunction
 */
export function ACB_UNIT(ticker, data) {
  const columnIndices = _calculateColumnIndices(data[0])

  const transactions = data
    .slice(1)
    .map((row, i) => ({ row: i + 2, ..._parseTransactionRecord(row, columnIndices) }))

  const { aggregates } = _calculateAggregates(transactions)
  const aggregated = aggregates[ticker]

  return aggregated.unitsOwned > 0 ? aggregated.totalCost / aggregated.unitsOwned : 0
}

/**
 * Calculates the total units owned of the specified ticker at the end of the transaction dataset.
 * @param {ticker} The ticker whose count needs to be calculated.
 * @param {data} The transaction dataset.
 * @return The total units owned for the ticker
 * @customfunction
 */
export function UNITS_OWNED(ticker, _account, data) {
  if (_account) {
    throw new Error("account param is no longer supported.")
  }

  const columnIndices = _calculateColumnIndices(data[0])

  const transactions = data
    .slice(1)
    .map((row, i) => ({ row: i + 2, ..._parseTransactionRecord(row, columnIndices) }))

  const { aggregates } = _calculateAggregates(transactions)
  const aggregated = aggregates[ticker]

  return aggregated.unitsOwned
}

/**
 * Calculates the full current report for all assets in the dataset
 */
export function ASSET_REPORT(data) {
  const filledData = data
    .filter(row => row.findIndex(col => Boolean(col)) >= 0)

  const columnIndices = _calculateColumnIndices(filledData[0])

  const transactions = filledData
    .slice(1)
    .map((row, i) => ({ row: i + 2, ..._parseTransactionRecord(row, columnIndices) }))

  const aggregatedTable = [...Object.entries(_calculateAggregates(transactions).aggregates)]
    // @ts-ignore
    .filter(([_ticker, aggregated]) => aggregated.unitsOwned > 0)
    .map(([ticker, aggregated]) => {
      // @ts-ignore
      const acbPerUnit = aggregated.totalCost / aggregated.unitsOwned
      return [ticker, {
        // @ts-ignore
        ...aggregated,
        acbPerUnit,
      }]
    })
    .sort(([ticker1], [ticker2]) => {
      if (ticker1 === ticker2) {
        return 0
      } else if (ticker1 < ticker2) {
        return -1
      } else {
        return 1
      }
    })
    .map(([ticker, { unitsOwned, totalCost, acbPerUnit }]) => ([ticker, unitsOwned, totalCost, acbPerUnit]))

  const titleColumn = ["Ticker", "Units Owned", "ACB", "ACB Per Unit"]
  return [titleColumn, ...aggregatedTable]
}

export function TRANSACTION_EFFECTS(data) {
  const filledData = data
    .filter(row => row.findIndex(col => Boolean(col)) >= 0)

  const columnIndices = _calculateColumnIndices(filledData[0])

  const transactions = filledData
    .slice(1)
    .map((row, i) => ({ row: i + 2, ..._parseTransactionRecord(row, columnIndices) }))

  const { effects } = _calculateAggregates(transactions)
  const titleColumn = ["ACB", "ACB Per Unit", "Total Units Owned", "Gain"]
  const formattedTable = effects.map(({ unitsOwned, totalCost, gain }) => {
    return [totalCost, unitsOwned > 0 ? totalCost / unitsOwned : 0, unitsOwned, gain]
  })

  return [
    titleColumn,
    ...formattedTable
  ]
}
