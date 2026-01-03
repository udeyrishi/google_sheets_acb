import { Money } from './money';
import {
  TRANSACTION_TYPE_TRF_IN,
  TRANSACTION_TYPE_BUY,
  TRANSACTION_TYPE_DRIP,
  TRANSACTION_TYPE_TRF_OUT,
  TRANSACTION_TYPE_SELL,
  TRANSACTION_TYPE_STAKE_REWARD,
  TRANSACTION_TYPE_NON_CASH_DIST,
  TRANSACTION_TYPE_RETURN_OF_CAPITAL,
  type TransactionType,
  type NetValueOnlyTransactionType,
  type Ticker,
  type TransactionRecord,
  type TransactionRecordBase,
  type TransactionRecordWithComponents,
} from './transaction_record';
import { formatErrorCause } from './utils';

export type PositionSnapshot = {
  unitsOwned: number;
  totalCost: Money;
};

export type PortfolioPositions = Record<Ticker, PositionSnapshot>;

export type PostTradeSnapshot = PositionSnapshot & {
  gain: Money;
};

export type AggregateResult = {
  aggregates: PortfolioPositions;
  effects: readonly PostTradeSnapshot[];
};

type ComponentsTransactionReducer = (
  previousSnapshot: PositionSnapshot,
  transaction: TransactionRecordWithComponents,
) => PostTradeSnapshot;

type BaseTransactionReducer = (
  previousSnapshot: PositionSnapshot,
  transaction: TransactionRecordBase,
) => PostTradeSnapshot;

const applyBuy: ComponentsTransactionReducer = (prev, transaction) => {
  if (transaction.netTransactionValue.greaterThan(Money.zero())) {
    throw new Error(
      `BUY transactions were expected to have a negative NTV conventionally to indicate a cash outflow.`,
    );
  }

  return {
    unitsOwned: prev.unitsOwned + transaction.units,
    // NTV is signed negative for buys, but we're tracking totalCost as the absolute value.
    totalCost: prev.totalCost.add(transaction.netTransactionValue.multiply(-1)),
    gain: Money.zero(),
  };
};

const applyDrip = applyBuy;

// Transfers can be the first event for a ticker (e.g., external ACB seeding).
// Treat TRF_IN/TRF_OUT as ACB changes, so paired transfers cancel but unpaired
// transfers establish or remove cost base.
const applyTrfIn: ComponentsTransactionReducer = (prev, transaction) => {
  if (transaction.netTransactionValue.lessThan(Money.zero())) {
    throw new Error(`TRF_IN transactions were expected to have a positive NTV conventionally.`);
  }

  return {
    unitsOwned: prev.unitsOwned + transaction.units,
    // NTV is signed positive for TRF_INS (unlike buys)
    totalCost: prev.totalCost.add(transaction.netTransactionValue),
    gain: Money.zero(),
  };
};

const applyTrfOut: ComponentsTransactionReducer = (prev, transaction) => {
  if (prev.unitsOwned <= 0) {
    throw new Error(
      `[${transaction.row}]: Cannot have a TRF_OUT transaction without owning any units.`,
    );
  }

  if (transaction.units > prev.unitsOwned) {
    throw new Error(
      `[${transaction.row}]: Cannot transfer out more units (${transaction.units}) than owned (${prev.unitsOwned}).`,
    );
  }

  if (transaction.netTransactionValue.greaterThan(Money.zero())) {
    throw new Error(`TRF_OUT transactions were expected to have a negative NTV conventionally.`);
  }

  const globalAcbPerUnitSoFar = prev.totalCost.divide(prev.unitsOwned);

  if (globalAcbPerUnitSoFar.notEquals(transaction.unitPrice)) {
    throw new Error(
      `[${transaction.row}]: globalAcbPerUnitSoFar ${globalAcbPerUnitSoFar} (${prev.totalCost} / ${prev.unitsOwned}) before the TRF_OUT transaction did not match the transaction's unitPrice ${transaction.unitPrice}.`,
    );
  }

  return {
    unitsOwned: prev.unitsOwned - transaction.units,
    totalCost: prev.totalCost.add(transaction.netTransactionValue),
    gain: Money.zero(),
  };
};

const applySell: ComponentsTransactionReducer = (prev, transaction) => {
  if (prev.unitsOwned <= 0) {
    throw new Error(
      `[${transaction.row}]: Cannot have a Sell transaction without owning any units.`,
    );
  }
  if (transaction.units > prev.unitsOwned) {
    throw new Error(`[${transaction.row}]: Cannot sell more units than owned.`);
  }

  if (transaction.netTransactionValue.lessThan(Money.zero())) {
    throw new Error(
      `SELL transactions were expected to have a positive NTV conventionally, since it involves a cash inflow.`,
    );
  }

  const globalAcbPerUnitSoFar = prev.totalCost.divide(prev.unitsOwned);
  const costBase = globalAcbPerUnitSoFar.multiply(transaction.units);
  const proceedsOfSale = transaction.netTransactionValue;

  return {
    unitsOwned: prev.unitsOwned - transaction.units,
    // Note that transaction.fees does not get added to the ACB on sale. It only reduces the net gains.
    // Do not add transaction.fees here.
    totalCost: prev.totalCost.subtract(costBase),
    gain: proceedsOfSale.subtract(costBase),
  };
};

const applyStakeReward: ComponentsTransactionReducer = (prev, transaction) => ({
  unitsOwned: prev.unitsOwned + transaction.units,
  totalCost: prev.totalCost,
  gain: Money.zero(),
});

const applyNcdis: BaseTransactionReducer = (prev, transaction) => {
  if (transaction.netTransactionValue.lessThan(Money.zero())) {
    throw new Error(
      'Non-cash distributions should have a positive conventional net transaction value.',
    );
  }

  return {
    totalCost: prev.totalCost.add(transaction.netTransactionValue),
    unitsOwned: prev.unitsOwned,
    gain: Money.zero(),
  };
};

const applyRoc: BaseTransactionReducer = (prev, transaction) => {
  if (transaction.netTransactionValue.lessThan(Money.zero())) {
    throw new Error('Returns of capital should have a positive conventional net transaction value');
  }

  return {
    totalCost: prev.totalCost.subtract(transaction.netTransactionValue),
    unitsOwned: prev.unitsOwned,
    gain: Money.zero(),
  };
};

type TransactionTypesRequiringComponentsWhenReducing = Exclude<
  TransactionType,
  NetValueOnlyTransactionType
>;

const COMPONENT_TRANSACTION_REDUCERS: Record<
  TransactionTypesRequiringComponentsWhenReducing,
  ComponentsTransactionReducer
> = {
  [TRANSACTION_TYPE_TRF_IN]: applyTrfIn,
  [TRANSACTION_TYPE_BUY]: applyBuy,
  [TRANSACTION_TYPE_DRIP]: applyDrip,
  [TRANSACTION_TYPE_TRF_OUT]: applyTrfOut,
  [TRANSACTION_TYPE_SELL]: applySell,
  [TRANSACTION_TYPE_STAKE_REWARD]: applyStakeReward,
};

const BASE_TRANSACTION_REDUCERS: Record<NetValueOnlyTransactionType, BaseTransactionReducer> = {
  [TRANSACTION_TYPE_NON_CASH_DIST]: applyNcdis,
  [TRANSACTION_TYPE_RETURN_OF_CAPITAL]: applyRoc,
};

export function calculateAggregates(transactions: readonly TransactionRecord[]): AggregateResult {
  return transactions.reduce(
    ({ aggregates, effects }, transaction, i) => {
      const previousTransaction = i > 0 ? transactions[i - 1] : null;
      if (previousTransaction && transaction.date.getTime() < previousTransaction.date.getTime()) {
        throw new Error(
          `[${transaction.row}]: Transaction date is less than the previous transaction date ${previousTransaction.date}`,
        );
      }

      const prev = aggregates[transaction.ticker] ?? {
        unitsOwned: 0,
        totalCost: Money.zero(),
      };

      const reducer: BaseTransactionReducer =
        BASE_TRANSACTION_REDUCERS[transaction.type] ??
        COMPONENT_TRANSACTION_REDUCERS[transaction.type];

      try {
        const effect = reducer(prev, transaction);

        return {
          aggregates: {
            ...aggregates,
            [transaction.ticker]: <PositionSnapshot>{
              unitsOwned: effect.unitsOwned,
              totalCost: effect.totalCost,
            },
          },
          effects: [...effects, effect],
        };
      } catch (error) {
        throw new Error(
          `[row: ${transaction.row}]: Failed to digest the transaction when accumulating.\n${formatErrorCause(error)}`,
        );
      }
    },
    {
      aggregates: <PortfolioPositions>{},
      effects: new Array<PostTradeSnapshot>(),
    },
  );
}
