import {
  COL_DATE,
  COL_TICKER,
  COL_TYPE,
  COL_UNITS,
  COL_UNIT_PRICE,
  COL_FEES,
  COL_NET_TRANSACTION_VALUE,
  ALL_KNOWN_TRANSACTION_TYPES,
} from './constants';

export function parseTransactionRecord(row, columnIndices) {
  const rawTransactionType = row[columnIndices[COL_TYPE]];

  const transactionTypeIndex = ALL_KNOWN_TRANSACTION_TYPES.findIndex(
    (knownTransactionType) =>
      rawTransactionType.toLowerCase().trim() === knownTransactionType.toLowerCase(),
  );
  if (transactionTypeIndex < 0) {
    throw new Error(`Unknown transaction type: ${rawTransactionType}`);
  }
  const santizedTransactionType = ALL_KNOWN_TRANSACTION_TYPES[transactionTypeIndex];

  return {
    date: row[columnIndices[COL_DATE]],
    ticker: row[columnIndices[COL_TICKER]].trim(),
    type: santizedTransactionType,
    units: row[columnIndices[COL_UNITS]],
    unitPrice: row[columnIndices[COL_UNIT_PRICE]],
    fees: row[columnIndices[COL_FEES]],
    netTransactionValue: row[columnIndices[COL_NET_TRANSACTION_VALUE]],
  };
}

export function calculateColumnIndices(titleRow) {
  function indexOfColumn(titles, columnName) {
    const index = titles.findIndex((title) => title.toLowerCase() === columnName.toLowerCase());

    if (index < 0) {
      throw new Error(`${columnName} could not be found in titles ${titles}.`);
    }

    return index;
  }

  return {
    [COL_DATE]: indexOfColumn(titleRow, COL_DATE),
    [COL_TICKER]: indexOfColumn(titleRow, COL_TICKER),
    [COL_TYPE]: indexOfColumn(titleRow, COL_TYPE),
    [COL_UNITS]: indexOfColumn(titleRow, COL_UNITS),
    [COL_UNIT_PRICE]: indexOfColumn(titleRow, COL_UNIT_PRICE),
    [COL_FEES]: indexOfColumn(titleRow, COL_FEES),
    [COL_NET_TRANSACTION_VALUE]: indexOfColumn(titleRow, COL_NET_TRANSACTION_VALUE),
  };
}
