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