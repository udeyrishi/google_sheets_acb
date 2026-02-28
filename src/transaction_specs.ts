import { Money } from './money';
import { Shares } from './shares';
import type { PositionSnapshot, PostTradeSnapshot } from './aggregation_types';
import {
  NET_VALUE_ONLY_TRANSACTION_TYPES,
  TRANSACTION_TYPE_TRF_IN,
  TRANSACTION_TYPE_BUY,
  TRANSACTION_TYPE_DRIP,
  TRANSACTION_TYPE_TRF_OUT,
  TRANSACTION_TYPE_SELL,
  TRANSACTION_TYPE_STAKE_REWARD,
  TRANSACTION_TYPE_NON_CASH_DIST,
  TRANSACTION_TYPE_RETURN_OF_CAPITAL,
  type TransactionType,
  type TransactionRecord,
  type TransactionRecordWithComponents,
  type Ticker,
  type NetValueOnlyTransactionType,
} from './transaction_record';

type NormalizationInput = {
  row: number;
  date: Date;
  ticker: Ticker;
  type: TransactionType;
  units: Shares | undefined;
  unitPrice: Money | undefined;
  netTransactionValue: Money | undefined;
  fees: Money | undefined;
};

type TransactionReducer = (
  previousSnapshot: PositionSnapshot,
  transaction: TransactionRecord,
) => PostTradeSnapshot;

export type TransactionSpec = {
  type: TransactionType;
  normalize: (input: NormalizationInput) => TransactionRecord;
  reduce: TransactionReducer;
};

const applyBuy: TransactionReducer = (prev, transaction) => {
  if (transaction.valueMode === 'netOnly') {
    throw new Error(`BUY transactions need components.`);
  }

  if (transaction.netTransactionValue.gt(Money.zero())) {
    throw new Error(
      `BUY transactions were expected to have a negative NTV conventionally to indicate a cash outflow.`,
    );
  }

  return {
    unitsOwned: prev.unitsOwned.add(transaction.units),
    // NTV is signed negative for buys, but we're tracking totalCost as the absolute value.
    totalCost: prev.totalCost.add(transaction.netTransactionValue.multiply(-1)),
  };
};

const applyDrip = applyBuy;

// Transfers can be the first event for a ticker (e.g., external ACB seeding).
// Treat TRF_IN/TRF_OUT as ACB changes, so paired transfers cancel but unpaired
// transfers establish or remove cost base.
const applyTrfIn: TransactionReducer = (prev, transaction) => {
  if (transaction.valueMode === 'netOnly') {
    throw new Error(`TRF_IN transactions need components.`);
  }

  if (transaction.netTransactionValue.lt(Money.zero())) {
    throw new Error(`TRF_IN transactions were expected to have a positive NTV conventionally.`);
  }

  return {
    unitsOwned: prev.unitsOwned.add(transaction.units),
    // NTV is signed positive for TRF_INS (unlike buys)
    totalCost: prev.totalCost.add(transaction.netTransactionValue),
  };
};

const applyTrfOut: TransactionReducer = (prev, transaction) => {
  if (transaction.valueMode === 'netOnly') {
    throw new Error(`TRF_OUT transactions need components.`);
  }

  if (prev.unitsOwned.lte(Shares.zero())) {
    throw new Error(
      `[${transaction.row}]: Cannot have a TRF_OUT transaction without owning any units.`,
    );
  }

  if (transaction.units.gt(prev.unitsOwned)) {
    throw new Error(
      `[${transaction.row}]: Cannot transfer out more units (${transaction.units}) than owned (${prev.unitsOwned}).`,
    );
  }

  if (transaction.netTransactionValue.gt(Money.zero())) {
    throw new Error(`TRF_OUT transactions were expected to have a negative NTV conventionally.`);
  }

  const globalAcbPerUnitSoFar = prev.totalCost.divide(prev.unitsOwned.valueOf());

  if (globalAcbPerUnitSoFar.notEquals(transaction.unitPrice)) {
    throw new Error(
      `[${transaction.row}]: globalAcbPerUnitSoFar ${globalAcbPerUnitSoFar} (${prev.totalCost} / ${prev.unitsOwned}) before the TRF_OUT transaction did not match the transaction's unitPrice ${transaction.unitPrice}.`,
    );
  }

  return {
    unitsOwned: prev.unitsOwned.subtract(transaction.units),
    totalCost: prev.totalCost.add(transaction.netTransactionValue),
  };
};

const applySell: TransactionReducer = (prev, transaction) => {
  if (transaction.valueMode === 'netOnly') {
    throw new Error(`SELL transactions need components.`);
  }

  if (prev.unitsOwned.lte(Shares.zero())) {
    throw new Error(
      `[${transaction.row}]: Cannot have a Sell transaction without owning any units.`,
    );
  }
  if (transaction.units.gt(prev.unitsOwned)) {
    throw new Error(`[${transaction.row}]: Cannot sell more units than owned.`);
  }

  if (transaction.netTransactionValue.lt(Money.zero())) {
    throw new Error(
      `SELL transactions were expected to have a positive NTV conventionally, since it involves a cash inflow.`,
    );
  }

  const globalAcbPerUnitSoFar = prev.totalCost.divide(prev.unitsOwned.valueOf());
  const costBase = globalAcbPerUnitSoFar.multiply(transaction.units.valueOf());
  const proceedsOfSale = transaction.netTransactionValue;

  return {
    unitsOwned: prev.unitsOwned.subtract(transaction.units),
    // Note that transaction.fees does not get added to the ACB on sale. It only reduces the net gains.
    // Do not add transaction.fees here.
    totalCost: prev.totalCost.subtract(costBase),
    gain: proceedsOfSale.subtract(costBase),
  };
};

const applyStakeReward: TransactionReducer = (prev, transaction) => {
  if (transaction.valueMode === 'netOnly') {
    throw new Error(`STK_RWD transactions need components.`);
  }

  if (transaction.netTransactionValue.lt(Money.zero())) {
    throw new Error(
      `STK_RWD transactions were expected to have a positive NTV conventionally to indicate an earning event.`,
    );
  }

  return {
    unitsOwned: prev.unitsOwned.add(transaction.units),
    totalCost: prev.totalCost.add(transaction.netTransactionValue),
    income: transaction.netTransactionValue,
  };
};

const applyNcdis: TransactionReducer = (prev, transaction) => {
  if (transaction.netTransactionValue.lt(Money.zero())) {
    throw new Error(
      'Non-cash distributions should have a positive conventional net transaction value.',
    );
  }

  return {
    totalCost: prev.totalCost.add(transaction.netTransactionValue),
    unitsOwned: prev.unitsOwned,
  };
};

const applyRoc: TransactionReducer = (prev, transaction) => {
  if (transaction.netTransactionValue.lt(Money.zero())) {
    throw new Error('Returns of capital should have a positive conventional net transaction value');
  }

  return {
    totalCost: prev.totalCost.subtract(transaction.netTransactionValue),
    unitsOwned: prev.unitsOwned,
  };
};

function calculateNTV({
  cashFlowDirection,
  units,
  unitPrice,
  fees,
}: {
  cashFlowDirection: 1 | -1;
  units: Shares;
  unitPrice: Money;
  fees: Money | undefined;
}): Money {
  const feeValue = fees ?? Money.zero();
  return unitPrice.multiply(units.valueOf() * cashFlowDirection).subtract(feeValue);
}

function calculateUnits({
  cashFlowDirection,
  ntv,
  unitPrice,
  fees,
}: {
  cashFlowDirection: 1 | -1;
  ntv: Money;
  unitPrice: Money;
  fees: Money | undefined;
}): Shares {
  const feeValue = fees ?? Money.zero();
  const numerator = ntv.add(feeValue).multiply(cashFlowDirection);
  return new Shares(numerator.divide(unitPrice));
}

function calculateUnitPrice({
  cashFlowDirection,
  ntv,
  units,
  fees,
}: {
  cashFlowDirection: 1 | -1;
  ntv: Money;
  units: Shares;
  fees: Money | undefined;
}): Money {
  const feeValue = fees ?? Money.zero();
  return ntv.add(feeValue).multiply(cashFlowDirection).divide(units.valueOf());
}

function normalizeInternal({
  input: {
    row,
    date,
    ticker,
    units: providedUnits,
    unitPrice: providedUnitPrice,
    netTransactionValue: providedNTV,
    fees,
  },
  type,
  cashFlowDirection,
}: {
  input: NormalizationInput;
  type: TransactionType;
  cashFlowDirection: 1 | -1;
}): TransactionRecord {
  const base = {
    row,
    date,
    ticker,
  };

  if (providedUnits !== undefined && providedUnitPrice !== undefined) {
    const expectedNTV: Money = calculateNTV({
      cashFlowDirection,
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
      if (providedUnits !== undefined) {
        throw new Error('Dev error: No units should have been available in this code branch.');
      }
      return {
        ...base,
        netTransactionValue: providedNTV,
        valueMode: 'components',
        units: calculateUnits({
          cashFlowDirection,
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
      if (providedUnitPrice !== undefined) {
        throw new Error('Dev error: No unitPrice should have been available in this code branch.');
      }
      return {
        ...base,
        netTransactionValue: providedNTV,
        valueMode: 'components',
        units: providedUnits,
        unitPrice: calculateUnitPrice({
          cashFlowDirection,
          units: providedUnits,
          fees,
          ntv: providedNTV,
        }),
        fees,
        type,
      } satisfies TransactionRecordWithComponents;
    }

    const allowNetOnly = (NET_VALUE_ONLY_TRANSACTION_TYPES as readonly TransactionType[]).includes(
      type,
    );

    if (!allowNetOnly) {
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
      type: type as NetValueOnlyTransactionType,
    } satisfies TransactionRecord;
  }

  throw new Error(
    `Incomplete transaction data. Please make sure the provided unitPrice=${providedUnitPrice}, units=${providedUnits}, and netTransactionValue=${providedNTV} makes sense for this transaction type=${type}.`,
  );
}

function createSpec({
  type,
  cashFlowDirection,
  reduce,
}: {
  type: TransactionType;
  cashFlowDirection: 1 | -1;
  reduce: TransactionReducer;
}): TransactionSpec {
  return {
    type,
    normalize: (input) => {
      if (input.type !== type) {
        throw new Error(
          `Spec designed for type ${type} cannot normalize an input with type ${input.type}.`,
        );
      }
      return normalizeInternal({
        input,
        type,
        cashFlowDirection,
      });
    },
    reduce,
  };
}

const TRANSACTION_SPECS: Record<TransactionType, TransactionSpec> = {
  [TRANSACTION_TYPE_TRF_IN]: createSpec({
    type: TRANSACTION_TYPE_TRF_IN,
    cashFlowDirection: 1,
    reduce: applyTrfIn,
  }),
  [TRANSACTION_TYPE_BUY]: createSpec({
    type: TRANSACTION_TYPE_BUY,
    cashFlowDirection: -1,
    reduce: applyBuy,
  }),
  [TRANSACTION_TYPE_DRIP]: createSpec({
    type: TRANSACTION_TYPE_DRIP,
    cashFlowDirection: -1,
    reduce: applyDrip,
  }),
  [TRANSACTION_TYPE_TRF_OUT]: createSpec({
    type: TRANSACTION_TYPE_TRF_OUT,
    cashFlowDirection: -1,
    reduce: applyTrfOut,
  }),
  [TRANSACTION_TYPE_SELL]: createSpec({
    type: TRANSACTION_TYPE_SELL,
    cashFlowDirection: 1,
    reduce: applySell,
  }),
  [TRANSACTION_TYPE_STAKE_REWARD]: createSpec({
    type: TRANSACTION_TYPE_STAKE_REWARD,
    cashFlowDirection: 1,
    reduce: applyStakeReward,
  }),
  [TRANSACTION_TYPE_NON_CASH_DIST]: createSpec({
    type: TRANSACTION_TYPE_NON_CASH_DIST,
    cashFlowDirection: 1,
    reduce: applyNcdis,
  }),
  [TRANSACTION_TYPE_RETURN_OF_CAPITAL]: createSpec({
    type: TRANSACTION_TYPE_RETURN_OF_CAPITAL,
    cashFlowDirection: 1,
    reduce: applyRoc,
  }),
};

export function getTransactionSpec(type: TransactionType): TransactionSpec {
  return TRANSACTION_SPECS[type];
}
