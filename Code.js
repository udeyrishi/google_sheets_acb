const _COL_DATE = 'Date'
const _COL_TICKER = 'Ticker'
const _COL_TYPE = 'Type'
const _COL_ACCOUNT = 'Account'
const _COL_UNITS = 'Units'
const _COL_UNIT_PRICE = 'Unit Price'
const _COL_FEES = 'Fees'
const _COL_NTV = 'Net Transaction Value'

const _TRANSACTION_TYPE_TRF_IN = 'TRF_IN'
const _TRANSACTION_TYPE_TRF_OUT = 'TRF_OUT'
const _TRANSACTION_TYPE_BUY = 'BUY'
const _TRANSACTION_TYPE_SELL = 'SELL'
const _TRANSACTION_TYPE_DRIP = 'DRIP'
const _TRANSACTION_TYPE_STAKE_REWARD = 'STK_RWD'
const _TRANSACTION_TYPE_NON_CASH_DIST = 'NCDIS'
const _TRANSACTION_TYPE_RETURN_OF_CAPITAL = 'ROC'

const _ALL_KNOWN_TRANSACTION_TYPES = [
    _TRANSACTION_TYPE_TRF_IN,
    _TRANSACTION_TYPE_TRF_OUT,
    _TRANSACTION_TYPE_BUY,
    _TRANSACTION_TYPE_SELL,
    _TRANSACTION_TYPE_DRIP,
    _TRANSACTION_TYPE_STAKE_REWARD,
    _TRANSACTION_TYPE_NON_CASH_DIST,
    _TRANSACTION_TYPE_RETURN_OF_CAPITAL,
]

function _parseTransactionRecord(row, columnIndices) {
    const rawTransactionType = row[columnIndices[_COL_TYPE]];

    const transactionTypeIndex = _ALL_KNOWN_TRANSACTION_TYPES.findIndex(
        (knownTransactionType) => rawTransactionType.toLowerCase().trim() === knownTransactionType.toLowerCase()
    );
    if (transactionTypeIndex < 0) {
        throw new Error(`Unknown transaction type: ${rawTransactionType}`)
    }
    const santizedTransactionType = _ALL_KNOWN_TRANSACTION_TYPES[transactionTypeIndex]

    return {
        date: row[columnIndices[_COL_DATE]],
        ticker: row[columnIndices[_COL_TICKER]].trim(),
        type: santizedTransactionType,
        account: row[columnIndices[_COL_ACCOUNT]].trim(),
        units: row[columnIndices[_COL_UNITS]],
        unitPrice: row[columnIndices[_COL_UNIT_PRICE]],
        fees: row[columnIndices[_COL_FEES]],
        netTransactionValue: row[columnIndices[_COL_NTV]],
    }
}

function _calculateColumnIndices(titleRow) {
    function indexOfColumn(titles, columnName) {
        const index = titles.findIndex((title) => title.toLowerCase() === columnName.toLowerCase());

        if (index < 0) {
            throw new Error(`${columnName} could not be found in titles ${titles}.`)
        }

        return index
    }

    return {
        [_COL_DATE]: indexOfColumn(titleRow, _COL_DATE),
        [_COL_TICKER]: indexOfColumn(titleRow, _COL_TICKER),
        [_COL_TYPE]: indexOfColumn(titleRow, _COL_TYPE),
        [_COL_ACCOUNT]: indexOfColumn(titleRow, _COL_ACCOUNT),
        [_COL_UNITS]: indexOfColumn(titleRow, _COL_UNITS),
        [_COL_UNIT_PRICE]: indexOfColumn(titleRow, _COL_UNIT_PRICE),
        [_COL_FEES]: indexOfColumn(titleRow, _COL_FEES),
        [_COL_NTV]: indexOfColumn(titleRow, _COL_NTV),
    }
}

function _findUniqueTickers(data) {
    const columnIndices = _calculateColumnIndices(data[0])

    const tickers = new Set(data
        .slice(1)
        .map(row => _parseTransactionRecord(row, columnIndices))
        .map(({ ticker }) => ticker)
    )

    return [...tickers].sort()
}

function _calculateAggregates(ticker, data) {
    const columnIndices = _calculateColumnIndices(data[0])

    const chronologicalTransactions = data
        .slice(1)
        .map((row, i) => ({ row: i + 2, ..._parseTransactionRecord(row, columnIndices) }))
        .filter(transaction => transaction.ticker === ticker)
    // .sort(({date: dateA}, {date: dateB}) => dateA.getTime() - dateB.getTime())

    const accountAggregations = chronologicalTransactions
        .reduce((accounts, transaction) => {
            let unitsOwned = 0;
            let totalCost = 0;

            if (transaction.account in accounts) {
                unitsOwned = accounts[transaction.account].unitsOwned;
                totalCost = accounts[transaction.account].totalCost;
            }

            switch (transaction.type) {
                case _TRANSACTION_TYPE_TRF_IN:
                case _TRANSACTION_TYPE_BUY:
                case _TRANSACTION_TYPE_DRIP: {
                    unitsOwned += transaction.units;
                    totalCost += (transaction.unitPrice * transaction.units) + transaction.fees;
                    break;
                }

                case _TRANSACTION_TYPE_TRF_OUT: {
                    if (unitsOwned <= 0) {
                        throw new Error(`[${transaction.row}]: Cannot have a TRF_OUT transaction without owning any units.`)
                    }

                    const accountAcbSoFar = totalCost / unitsOwned;
                    if (accountAcbSoFar !== transaction.unitPrice) {
                        throw new Error(`[${transaction.row}]: accountAcbSoFar ${accountAcbSoFar} (${totalCost} / ${unitsOwned}) before the TRF_OUT transaction did not match the transaction's unitPrice ${transaction.unitPrice}.`)
                    }

                    unitsOwned += -transaction.units;
                    totalCost += -(accountAcbSoFar * transaction.units) + transaction.fees;
                    break;
                }

                case _TRANSACTION_TYPE_SELL: {
                    if (unitsOwned <= 0) {
                        throw new Error(`[${transaction.row}]: Cannot have a Sell transaction without owning any units.`)
                    }

                    const accountAcbSoFar = totalCost / unitsOwned;
                    unitsOwned += - transaction.units;
                    totalCost += -(accountAcbSoFar * transaction.units) + transaction.fees;
                    break;
                }

                case _TRANSACTION_TYPE_STAKE_REWARD: {
                    unitsOwned += transaction.units;
                    break;
                }

                case _TRANSACTION_TYPE_NON_CASH_DIST: {
                    if (transaction.netTransactionValue < 0) {
                        throw new Error(
                            `[${transaction.row}]: Non-cash distributions should have a positive net transaction value, since they\'re an income type of sorts.`
                        )
                    }
                    totalCost += transaction.netTransactionValue;
                    break;
                }

                case _TRANSACTION_TYPE_RETURN_OF_CAPITAL: {
                    if (transaction.netTransactionValue < 0) {
                        throw new Error(
                            `[${transaction.row}]: Returns of capital should have a positive net transaction value, since they\'re an income type of sorts.`
                        )
                    }
                    totalCost += -transaction.netTransactionValue;
                    break;
                }

                default:
                    throw new Error(`[${transaction.row}]: Unknown transaction type: ${transaction.type}`)
            }

            return {
                ...accounts,
                [transaction.account]: {
                    unitsOwned,
                    totalCost,
                },
            }
        }, {
            // shape: [accountName]: {unitsOwned: number, totalCost: number}
        });

    const overallAggregates = [...Object.values(accountAggregations)].reduce((aggregatedAcrossAccounts, perAccountInfo) => {
        return {
            unitsOwned: aggregatedAcrossAccounts.unitsOwned + perAccountInfo.unitsOwned,
            totalCost: aggregatedAcrossAccounts.totalCost + perAccountInfo.totalCost,
        }
    }, {
        unitsOwned: 0,
        totalCost: 0,
    });

    return {
        ...overallAggregates,
        accounts: accountAggregations,
    }
}

/**
 * Calculates the ACB per unit.
 * @param {ticker} The ticker whose ACB per unit needs to be calculated.
 * @param {data} The transaction dataset.
 * @return The ACB per unit for the specified ticker given the data
 * @customfunction
 */
function ACB_UNIT(ticker, account, data) {
    let aggregated = _calculateAggregates(ticker, data)
    if (account) {
        aggregated = aggregated.accounts[account]
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
function ACB(ticker, account, data) {
    let aggregated = _calculateAggregates(ticker, data)
    if (account) {
        aggregated = aggregated.accounts[account]
    }
    return aggregated.totalCost
}

/**
 * Calculates the total units owned of the specified ticker at the end of the transaction dataset.
 * @param {ticker} The ticker whose count needs to be calculated.
 * @param {data} The transaction dataset.
 * @return The total units owned for the ticker
 * @customfunction
 */
function UNITS_OWNED(ticker, account, data) {
    let aggregated = _calculateAggregates(ticker, data)
    if (account) {
        aggregated = aggregated.accounts[account]
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
function GAIN(data) {
    if (!Array.isArray(data) || data.length < 2) {
        throw new Error("data must be a 2D array with size >= 2")
    }

    const historicalData = data.slice(0, data.length - 1)
    const subjectTransaction = data[data.length - 1]

    const columnIndices = _calculateColumnIndices(historicalData[0])
    const transaction = _parseTransactionRecord(subjectTransaction, columnIndices)

    if (transaction.type !== _TRANSACTION_TYPE_SELL) {
        return 0
    }

    const costBase = ACB_UNIT(transaction.ticker, null, historicalData) * transaction.units
    const proceedsOfSale = (transaction.units * transaction.unitPrice) - transaction.fees
    return proceedsOfSale - costBase
}

function NTV(type, units, unitPrice, fees) {
    let signMultiplier = 0;

    switch (type) {
        case _TRANSACTION_TYPE_TRF_IN:
        case _TRANSACTION_TYPE_SELL:
        case _TRANSACTION_TYPE_STAKE_REWARD:
            signMultiplier = 1;
            break;

        case _TRANSACTION_TYPE_BUY:
        case _TRANSACTION_TYPE_DRIP:
        case _TRANSACTION_TYPE_TRF_OUT:
            signMultiplier = -1;
            break;

        case _TRANSACTION_TYPE_NON_CASH_DIST:
        case _TRANSACTION_TYPE_RETURN_OF_CAPITAL:
            throw new Error(`NTV must be provided as-is from the statement for a transaction of type ${type}.`)

        default:
            throw new Error(`Unsupported transaction type: ${type}`)
    }

    if (unitPrice < 0 || units < 0 || fees < 0) {
        throw new Error(`unitPrice ${unitPrice}, units ${units}, and fees ${fees} must all be provided as positive absolute values.`)
    }

    return (signMultiplier * unitPrice * units) - fees;
}

/**
 * Calculates the full current report for all assets in the dataset
 */
function ASSET_REPORT(data) {
    const filledData = data
        .filter(row => row.findIndex(col => Boolean(col)) >= 0)

    const allTickers = _findUniqueTickers(filledData)

    const aggregatedTable = allTickers
        .map(ticker => [ticker, _calculateAggregates(ticker, filledData)])
        .filter(([_ticker, aggregated]) => aggregated.unitsOwned > 0)
        .map(([ticker, aggregated]) => {
            const acbPerUnit = aggregated.totalCost / aggregated.unitsOwned
            return [ticker, {
                ...aggregated,
                acbPerUnit,
            }]
        })
        .map(([ticker, { unitsOwned, totalCost, acbPerUnit }]) => ([ticker, unitsOwned, totalCost, acbPerUnit]))

    const titleColumn = ["Ticker", "Units Owned", "ACB", "ACB Per Unit"]
    return [titleColumn, ...aggregatedTable]
}
