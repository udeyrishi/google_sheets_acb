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
 * Calculates the ACB per unit.
 * @param {ticker} The ticker whose ACB needs to be calculated.
 * @param {data} The transaction dataset.
 * @return The ACB for the specified ticker given the data
 * @customfunction
 */
// function ACB(ticker, account, data) {
//   let aggregated = _calculateAggregates(ticker, data)
//   if (account) {
//     aggregated = aggregated.accounts[account]
//   }
//   return aggregated.totalCost
// }

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
 * Calculates the gain on a Sale transaction.
 * @param {data} The data set to be used for calculating the gain. The last row must be a Sale transaction.
 * All other rows must correspond to historical transactions that will be used for calculating the ACB at the time of sale.
 * @return The gain (if positive) or loss (if negative) for the transaction
 * @customfunction
 */
// function GAIN(data) {
//   if (!Array.isArray(data) || data.length < 2) {
//     throw new Error("data must be a 2D array with size >= 2")
//   }

//   const historicalData = data.slice(0, data.length - 1)
//   const subjectTransaction = data[data.length - 1]

//   const columnIndices = _calculateColumnIndices(historicalData[0])
//   const transaction = _parseTransactionRecord(subjectTransaction, columnIndices)

//   if (transaction.type !== _TRANSACTION_TYPE_SELL) {
//     return 0
//   }

//   const costBase = ACB_UNIT(transaction.ticker, null, historicalData) * transaction.units
//   const proceedsOfSale = (transaction.units * transaction.unitPrice) - transaction.fees
//   return proceedsOfSale - costBase
// }

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
