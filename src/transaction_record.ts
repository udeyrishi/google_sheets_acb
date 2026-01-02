export type Money = number;

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
 *
 * The following type system is modelling this expectation.
 */

export const NET_VALUE_ONLY_TRANSACTION_TYPES = [
  TRANSACTION_TYPE_NON_CASH_DIST,
  TRANSACTION_TYPE_RETURN_OF_CAPITAL,
] as const;

export type NetValueOnlyTransactionType = (typeof NET_VALUE_ONLY_TRANSACTION_TYPES)[number];

export type TransactionRecordBase = {
  row: number;
  date: Date;
  ticker: Ticker;
  netTransactionValue: Money;
  fees?: Money;
};

export type TransactionRecordNetOnly = TransactionRecordBase & {
  valueMode: 'netOnly';
  type: NetValueOnlyTransactionType;
  units?: undefined;
  unitPrice?: undefined;
};

export type TransactionRecordWithComponents = TransactionRecordBase & {
  valueMode: 'components';
  units: number;
  unitPrice: Money;
  type: TransactionType;
};

export type TransactionRecord = TransactionRecordWithComponents | TransactionRecordNetOnly;
