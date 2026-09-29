import type { Money } from './money';
import type { Shares } from './shares';

export type Ticker = string;

export const TRANSACTION_TYPE_TRF_IN = 'TRF_IN';
export const TRANSACTION_TYPE_TRF_OUT = 'TRF_OUT';
export const TRANSACTION_TYPE_BUY = 'BUY';
export const TRANSACTION_TYPE_SELL = 'SELL';
export const TRANSACTION_TYPE_DRIP = 'DRIP';
export const TRANSACTION_TYPE_STAKE_REWARD = 'STK_RWD';
export const TRANSACTION_TYPE_NON_CASH_DIST = 'NCDIS';
export const TRANSACTION_TYPE_RETURN_OF_CAPITAL = 'ROC';

export const ALL_KNOWN_TRANSACTION_TYPES = [
  TRANSACTION_TYPE_TRF_IN,
  TRANSACTION_TYPE_TRF_OUT,
  TRANSACTION_TYPE_BUY,
  TRANSACTION_TYPE_SELL,
  TRANSACTION_TYPE_DRIP,
  TRANSACTION_TYPE_STAKE_REWARD,
  TRANSACTION_TYPE_NON_CASH_DIST,
  TRANSACTION_TYPE_RETURN_OF_CAPITAL,
] as const;

export type TransactionType = (typeof ALL_KNOWN_TRANSACTION_TYPES)[number];

/**
 * NCDIS and ROC transactions just need the net transaction values for book-keeping.
 * These can carry the components (unitPrice, units, fees), but it's not required.
 *
 * All other transaction types need at least some component info. These legal combinations are allowed:
 * - Have unitPrice and units (with optional fees) -> NTV can be computed
 * - Have units and NTV (with optional fees) -> unitPrice can be computed
 * - Have unitPrice and NTV (with optional fees) -> units can be computed
 * - Have everything -> we can sanity check that the math is lining up
 * - Transfers with units only (and optional fees) defer valuation to aggregation
 *
 * The following type system is modelling this expectation.
 */

export const NET_VALUE_ONLY_TRANSACTION_TYPES = [
  TRANSACTION_TYPE_NON_CASH_DIST,
  TRANSACTION_TYPE_RETURN_OF_CAPITAL,
] as const;

export type NetValueOnlyTransactionType = (typeof NET_VALUE_ONLY_TRANSACTION_TYPES)[number];

export const POTENTIALLY_INFERRABLE_TRANSACTION_TYPES = [
  TRANSACTION_TYPE_TRF_OUT,
  TRANSACTION_TYPE_TRF_IN,
] as const;

export type PotentiallyInferrableTransactionType =
  (typeof POTENTIALLY_INFERRABLE_TRANSACTION_TYPES)[number];

export const areValuesInferrable = (
  transactionType: TransactionType,
): transactionType is PotentiallyInferrableTransactionType => {
  return (POTENTIALLY_INFERRABLE_TRANSACTION_TYPES as readonly TransactionType[]).includes(
    transactionType,
  );
};

export const onlyNetValueAllowed = (
  transactionType: TransactionType,
): transactionType is NetValueOnlyTransactionType => {
  return (NET_VALUE_ONLY_TRANSACTION_TYPES as readonly TransactionType[]).includes(transactionType);
};

export type TransactionRecordBase = {
  row: number;
  date: Date;
  ticker: Ticker;
  fees?: Money;
};

export type TransactionRecordNetOnly = TransactionRecordBase & {
  valueMode: 'netOnly';
  type: NetValueOnlyTransactionType;
  units?: undefined;
  unitPrice?: undefined;
  netTransactionValue: Money;
};

export type TransactionRecordWithComponents = TransactionRecordBase & {
  valueMode: 'components';
  type: TransactionType;
  units: Shares;
  unitPrice: Money;
  netTransactionValue: Money;
};

/** Transfer valuation is deferred until aggregation has position or matching-transfer context. */
export type TransactionRecordWithPotentiallyInferrableValue = TransactionRecordBase & {
  valueMode: 'potentiallyInferrable';
  type: PotentiallyInferrableTransactionType;
  units: Shares;
  unitPrice?: undefined;
  netTransactionValue?: undefined;
};

export type TransactionRecord =
  | TransactionRecordWithComponents
  | TransactionRecordNetOnly
  | TransactionRecordWithPotentiallyInferrableValue;
