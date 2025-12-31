if (typeof module !== "undefined" && module && module.exports) {
  Object.assign(globalThis, require("./Constants"));
}

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
    [_COL_UNITS]: indexOfColumn(titleRow, _COL_UNITS),
    [_COL_UNIT_PRICE]: indexOfColumn(titleRow, _COL_UNIT_PRICE),
    [_COL_FEES]: indexOfColumn(titleRow, _COL_FEES),
    [_COL_NTV]: indexOfColumn(titleRow, _COL_NTV),
  }
}

if (typeof module !== "undefined" && module && module.exports) {
  module.exports = {
    _parseTransactionRecord,
    _calculateColumnIndices,
  };
}
