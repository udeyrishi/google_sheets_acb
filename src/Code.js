const _IS_NODE = module?.exports;
const { _TRANSACTION_TYPE_SELL } = _IS_NODE ? require("./Constants") : globalThis;
const { _parseTransactionRecord, _calculateColumnIndices } = _IS_NODE ? require("./Parser") : globalThis;
const { _calculateAggregates } = _IS_NODE ? require("./Aggregation") : globalThis;

/**
 * Calculates the ACB per unit.
 * @param {ticker} The ticker whose ACB per unit needs to be calculated.
 * @param {data} The transaction dataset.
 * @return The ACB per unit for the specified ticker given the data
 * @customfunction
 */
function ACB_UNIT(ticker, account, data) {
  const columnIndices = _calculateColumnIndices(data[0])

  const transactions = data
    .slice(1)
    .map((row, i) => ({ row: i + 2, ..._parseTransactionRecord(row, columnIndices) }))

  const { overallAggregates, accounts } = _calculateAggregates(transactions)

  let aggregated;
  if (account) {
    aggregated = accounts[account][ticker]
  } else {
    aggregated = overallAggregates[ticker]
  }

  return aggregated.unitsOwned > 0 ? aggregated.totalCost / aggregated.unitsOwned : 0
}

/**
 * Calculates the total units owned of the specified ticker at the end of the transaction dataset.
 * @param {ticker} The ticker whose count needs to be calculated.
 * @param {data} The transaction dataset.
 * @return The total units owned for the ticker
 * @customfunction
 */
function UNITS_OWNED(ticker, account, data) {
  const columnIndices = _calculateColumnIndices(data[0])

  const transactions = data
    .slice(1)
    .map((row, i) => ({ row: i + 2, ..._parseTransactionRecord(row, columnIndices) }))

  const { overallAggregates, accounts } = _calculateAggregates(transactions)

  let aggregated;
  if (account) {
    aggregated = accounts[account][ticker]
  } else {
    aggregated = overallAggregates[ticker]
  }

  return aggregated.unitsOwned
}

/**
 * Calculates the full current report for all assets in the dataset
 */
function ASSET_REPORT(data) {
  const filledData = data
    .filter(row => row.findIndex(col => Boolean(col)) >= 0)

  const columnIndices = _calculateColumnIndices(filledData[0])

  const transactions = filledData
    .slice(1)
    .map((row, i) => ({ row: i + 2, ..._parseTransactionRecord(row, columnIndices) }))

  const aggregatedTable = [...Object.entries(_calculateAggregates(transactions).overallAggregates)]
    .filter(([_ticker, aggregated]) => aggregated.unitsOwned > 0)
    .map(([ticker, aggregated]) => {
      const acbPerUnit = aggregated.totalCost / aggregated.unitsOwned
      return [ticker, {
        ...aggregated,
        acbPerUnit,
      }]
    })
    .sort(([ticker1], [ticker2]) => {
      if (ticker1 == ticker2) {
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

function TRANSACTION_EFFECTS(data) {
  const filledData = data
    .filter(row => row.findIndex(col => Boolean(col)) >= 0)

  const columnIndices = _calculateColumnIndices(filledData[0])

  const transactions = filledData
    .slice(1)
    .map((row, i) => ({ row: i + 2, ..._parseTransactionRecord(row, columnIndices) }))

  const { effects } = _calculateAggregates(transactions)

  const titleColumn = ["ACB", "ACB Per Unit", "Total Units Owned", "Gain"]

  const formattedTable = effects.map(({ unitsOwned, totalCost }, i) => {
    const transaction = transactions[i]

    let gain = 0
    if (transaction.type === _TRANSACTION_TYPE_SELL) {
      const historicalData = filledData.slice(0, i + 1)
      const costBase = ACB_UNIT(transaction.ticker, null, historicalData) * transaction.units
      const proceedsOfSale = (transaction.units * transaction.unitPrice) - transaction.fees
      gain = proceedsOfSale - costBase
    }

    return [totalCost, unitsOwned > 0 ? totalCost / unitsOwned : 0, unitsOwned, gain]
  }
  )

  return [
    titleColumn,
    ...formattedTable
  ]
}

if (module?.exports) {
  module.exports = {
    ACB_UNIT,
    UNITS_OWNED,
    ASSET_REPORT,
    TRANSACTION_EFFECTS,
  };
}
