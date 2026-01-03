import type { SheetRow, SheetScalar } from './g_sheet_types';
import type { Ticker } from './transaction_record';
import { Money } from './money';
import { Shares } from './shares';
import {
  type TransactionRecord,
  type TransactionRecordNetOnly,
  type TransactionRecordWithComponents,
  type TransactionType,
  type NetValueOnlyTransactionType,
  TRANSACTION_TYPE_BUY,
  TRANSACTION_TYPE_DRIP,
  TRANSACTION_TYPE_SELL,
  TRANSACTION_TYPE_STAKE_REWARD,
  TRANSACTION_TYPE_TRF_IN,
  TRANSACTION_TYPE_TRF_OUT,
  TRANSACTION_TYPE_NON_CASH_DIST,
  TRANSACTION_TYPE_RETURN_OF_CAPITAL,
  ALL_KNOWN_TRANSACTION_TYPES,
  NET_VALUE_ONLY_TRANSACTION_TYPES,
} from './transaction_record';
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

const CASH_FLOW_DIRECTIONS: Record<TransactionType, 1 | -1> = {
  [TRANSACTION_TYPE_TRF_IN]: 1,
  [TRANSACTION_TYPE_SELL]: 1,
  [TRANSACTION_TYPE_STAKE_REWARD]: 1,
  [TRANSACTION_TYPE_BUY]: -1,
  [TRANSACTION_TYPE_DRIP]: -1,
  [TRANSACTION_TYPE_TRF_OUT]: -1,
  [TRANSACTION_TYPE_RETURN_OF_CAPITAL]: 1,
  [TRANSACTION_TYPE_NON_CASH_DIST]: 1,
};

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

function calculateNTV({
  transactionType,
  units,
  unitPrice,
  fees,
}: {
  transactionType: TransactionType;
  units: Shares;
  unitPrice: Money;
  fees: Money | undefined;
}): Money {
  const cashFlowDirection = CASH_FLOW_DIRECTIONS[transactionType];
  const feeValue = fees ?? Money.zero();
  return unitPrice.multiply(units.valueOf() * cashFlowDirection).subtract(feeValue);
}

function calculateUnits({
  transactionType,
  ntv,
  unitPrice,
  fees,
}: {
  transactionType: TransactionType;
  ntv: Money;
  unitPrice: Money;
  fees: Money | undefined;
}): Shares {
  const cashFlowDirection = CASH_FLOW_DIRECTIONS[transactionType];
  const feeValue = fees ?? Money.zero();
  const numerator = ntv.add(feeValue).multiply(cashFlowDirection);
  return new Shares(numerator.divide(unitPrice));
}

function calculateUnitPrice({
  transactionType,
  ntv,
  units,
  fees,
}: {
  transactionType: TransactionType;
  ntv: Money;
  units: Shares;
  fees: Money | undefined;
}): Money {
  const cashFlowDirection = CASH_FLOW_DIRECTIONS[transactionType];
  const feeValue = fees ?? Money.zero();
  return ntv.add(feeValue).multiply(cashFlowDirection).divide(units.valueOf());
}

function isNetValueOnlyTransactionType(type: TransactionType): type is NetValueOnlyTransactionType {
  return (NET_VALUE_ONLY_TRANSACTION_TYPES as readonly TransactionType[]).includes(type);
}

export function parseTransactionRecord(
  rowNumber: number,
  row: SheetRow,
  columnIndices: ColumnIndices,
): TransactionRecord {
  try {
    const type: TransactionType = parseTransactionType(row, columnIndices);
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

    const base = {
      row: rowNumber,
      date,
      ticker,
    };

    if (providedUnits !== undefined && providedUnitPrice !== undefined) {
      // Components are provided. NTV is either directly provided (which will be sanity checked)
      // or can be derived.
      const expectedNTV: Money = calculateNTV({
        transactionType: type,
        units: providedUnits,
        unitPrice: providedUnitPrice,
        fees,
      });

      if (providedNTV !== undefined && providedNTV.notEquals(expectedNTV)) {
        throw new Error(
          `Provided net transaction value ${providedNTV} did not match expected ${expectedNTV}.`,
        );
      }

      return {
        ...base,
        netTransactionValue: providedNTV ?? expectedNTV,
        valueMode: 'components',
        units: providedUnits,
        unitPrice: providedUnitPrice,
        fees,
        type,
      } satisfies TransactionRecordWithComponents;
    }

    if (providedNTV !== undefined) {
      if (providedUnitPrice !== undefined) {
        // NTV + unitPrice are provided. units can be derived.
        if (providedUnits !== undefined) {
          throw new Error('Dev error: No units should have been available in this code branch.');
        }
        return {
          ...base,
          netTransactionValue: providedNTV,
          valueMode: 'components',
          units: calculateUnits({
            transactionType: type,
            unitPrice: providedUnitPrice,
            fees,
            ntv: providedNTV,
          }),
          unitPrice: providedUnitPrice,
          fees,
          type,
        } satisfies TransactionRecordWithComponents;
      }

      if (providedUnits !== undefined) {
        // NTV + units are provided. unitPrice can be derived.
        if (providedUnitPrice !== undefined) {
          throw new Error(
            'Dev error: No unitPrice should have been available in this code branch.',
          );
        }
        return {
          ...base,
          netTransactionValue: providedNTV,
          valueMode: 'components',
          units: providedUnits,
          unitPrice: calculateUnitPrice({
            transactionType: type,
            units: providedUnits,
            fees,
            ntv: providedNTV,
          }),
          fees,
          type,
        } satisfies TransactionRecordWithComponents;
      }

      // Only NTV is provided; none of the components. This is only legal for some transaction types.
      if (!isNetValueOnlyTransactionType(type)) {
        throw new Error(
          `Net-only transaction rows are only supported for ${[
            ...NET_VALUE_ONLY_TRANSACTION_TYPES,
          ].join(', ')}.`,
        );
      }

      return {
        ...base,
        valueMode: 'netOnly',
        netTransactionValue: providedNTV,
        fees,
        type,
      } satisfies TransactionRecordNetOnly;
    }

    throw new Error(
      `Incomplete transaction data. Please make sure the provided unitPrice=${providedUnitPrice}, units=${providedUnits}, and netTransactionValue=${providedNTV} makes sense for this transaction type=${type}.`,
    );
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
