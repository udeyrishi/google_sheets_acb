import type { TransactionType } from './constants';
import {
  COL_DATE,
  COL_TICKER,
  COL_TYPE,
  COL_UNITS,
  COL_UNIT_PRICE,
  COL_FEES,
  COL_NET_TRANSACTION_VALUE,
  ALL_KNOWN_TRANSACTION_TYPES,
  type ColTitle,
  ALL_KNOWN_COL_TITLES,
} from './constants';

export type SheetScalar = string | number | boolean | Date | null;

export type SheetRow = readonly SheetScalar[];

export type SheetTable = readonly SheetRow[];

export type ColumnIndices = Record<ColTitle, number>;

export type Money = number;

export type TransactionRecord = {
  date: Date;
  ticker: string;
  type: TransactionType;
  units: number;
  unitPrice: Money;
  fees: Money;
  netTransactionValue: Money;
};

function parseTransactionType(row: SheetRow, columnIndices: ColumnIndices) {
  const rawTransactionType = row[columnIndices[COL_TYPE]];

  const transactionTypeIndex = ALL_KNOWN_TRANSACTION_TYPES.findIndex(
    (knownTransactionType) =>
      typeof rawTransactionType === 'string' &&
      rawTransactionType.toLowerCase().trim() === knownTransactionType.toLowerCase(),
  );

  if (transactionTypeIndex < 0) {
    throw new Error(`Unknown transaction type: ${rawTransactionType}`);
  }

  return ALL_KNOWN_TRANSACTION_TYPES[transactionTypeIndex];
}

function parseDateValue(value: SheetScalar, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} must be a valid Date, received: ${value}`);
  }

  return value;
}

function parseStringValue(value: SheetScalar, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string, received: ${value}`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return trimmed;
}

function parseNumberValue(value: SheetScalar, label: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`${label} must be a number, received empty string.`);
    }
    const normalized = trimmed.replace(/,/g, '');
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`${label} must be a finite number, received: ${value}`);
}

export function parseTransactionRecord(
  row: SheetRow,
  columnIndices: ColumnIndices,
): TransactionRecord {
  return {
    date: parseDateValue(row[columnIndices[COL_DATE]], 'Transaction date'),
    ticker: parseStringValue(row[columnIndices[COL_TICKER]], 'Ticker'),
    type: parseTransactionType(row, columnIndices),
    units: parseNumberValue(row[columnIndices[COL_UNITS]], 'Units'),
    unitPrice: parseNumberValue(row[columnIndices[COL_UNIT_PRICE]], 'Unit price'),
    fees: parseNumberValue(row[columnIndices[COL_FEES]], 'Fees'),
    netTransactionValue: parseNumberValue(
      row[columnIndices[COL_NET_TRANSACTION_VALUE]],
      'Net transaction value',
    ),
  };
}

export function calculateColumnIndices(titleRow: SheetRow): ColumnIndices {
  function indexOfColumn(columnName: ColTitle) {
    const index = titleRow.findIndex(
      (title) =>
        typeof title === 'string' && title.trim().toLowerCase() === columnName.toLowerCase(),
    );

    if (index < 0) {
      throw new Error(`${columnName} could not be found in titles [${titleRow}].`);
    }

    return index;
  }

  return Object.fromEntries(
    ALL_KNOWN_COL_TITLES.map((colTitle) => [colTitle, indexOfColumn(colTitle)] as const),
  ) as Record<ColTitle, number>;
}
