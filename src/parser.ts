import type { SheetRow, SheetScalar } from './g_sheet_types';
import type { Ticker } from './transaction_record';
import { Money } from './money';
import { Shares } from './shares';
import {
  type TransactionRecord,
  type TransactionType,
  ALL_KNOWN_TRANSACTION_TYPES,
} from './transaction_record';
import { getTransactionSpec } from './transaction_specs';
import { formatErrorCause } from './utils';

const COL_DATE = 'Date';
const COL_TICKER = 'Ticker';
const COL_TYPE = 'Type';
const COL_UNITS = 'Units';
const COL_UNIT_PRICE = 'Unit Price';
const COL_FEES = 'Fees';
const COL_NET_TRANSACTION_VALUE = 'Net Transaction Value';

const ALL_KNOWN_COL_TITLES = [
  COL_DATE,
  COL_TICKER,
  COL_TYPE,
  COL_UNITS,
  COL_UNIT_PRICE,
  COL_FEES,
  COL_NET_TRANSACTION_VALUE,
] as const;

type ColTitle = (typeof ALL_KNOWN_COL_TITLES)[number];

export type ColumnIndices = Record<ColTitle, number>;

function parseTransactionType(row: SheetRow, columnIndices: ColumnIndices): TransactionType {
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

function parseSharesValue(value: SheetScalar, label: string): Shares {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Shares(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`${label} must be a number, received empty string.`);
    }
    const normalized = trimmed.replace(/,/g, '');
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return new Shares(parsed);
    }
  }

  throw new Error(`${label} must be a finite number, received: ${value}`);
}

function parseMoneyValue(value: SheetScalar, label: string): Money {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Money(value);
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\$/g, '').replace(/,/g, '').trim();
    if (!normalized) {
      throw new Error(`${label} must be a number, received: ${value}`);
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return new Money(parsed);
    }
  }

  throw new Error(`${label} must be a finite number, received: ${value}`);
}

function isBlankCell(value: SheetScalar): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '');
}

function parseOptionalSharesValue(value: SheetScalar, label: string): Shares | undefined {
  if (isBlankCell(value)) {
    return undefined;
  }

  return parseSharesValue(value, label);
}

function parseOptionalMoneyValue(value: SheetScalar, label: string): Money | undefined {
  if (isBlankCell(value)) {
    return undefined;
  }

  return parseMoneyValue(value, label);
}

export function parseTransactionRecord(
  rowNumber: number,
  row: SheetRow,
  columnIndices: ColumnIndices,
): TransactionRecord {
  try {
    const type: TransactionType = parseTransactionType(row, columnIndices);
    const spec = getTransactionSpec(type);
    const date: Date = parseDateValue(row[columnIndices[COL_DATE]], 'Transaction date');
    const ticker: Ticker = parseStringValue(row[columnIndices[COL_TICKER]], 'Ticker');
    const providedUnits: Shares | undefined = parseOptionalSharesValue(
      row[columnIndices[COL_UNITS]],
      'Units',
    );
    const providedUnitPrice: Money | undefined = parseOptionalMoneyValue(
      row[columnIndices[COL_UNIT_PRICE]],
      'Unit price',
    );
    const fees: Money | undefined = parseOptionalMoneyValue(row[columnIndices[COL_FEES]], 'Fees');
    const providedNTV: Money | undefined = parseOptionalMoneyValue(
      row[columnIndices[COL_NET_TRANSACTION_VALUE]],
      'Net transaction value',
    );

    return spec.normalize({
      row: rowNumber,
      date,
      ticker,
      type,
      units: providedUnits,
      unitPrice: providedUnitPrice,
      netTransactionValue: providedNTV,
      fees,
    });
  } catch (error) {
    throw new Error(
      `[row: ${rowNumber}]: Failed to parse the transaction record.\n${formatErrorCause(error)}`,
    );
  }
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
