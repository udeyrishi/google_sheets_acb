import type { TransactionType } from './constants';

export type Money = number;

export type Ticker = string;

export type TransactionRecord = {
  row: number;
  date: Date;
  ticker: Ticker;
  type: TransactionType;
  units: number;
  unitPrice: Money;
  fees: Money;
  netTransactionValue: Money;
};
