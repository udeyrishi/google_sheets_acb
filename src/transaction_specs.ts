import { Money } from './money';
import { Shares } from './shares';
import type { AggregationContext, PositionSnapshot, PostTradeSnapshot } from './aggregation_types';
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
  areValuesInferrable,
  onlyNetValueAllowed,
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
  context: AggregationContext,
) => PostTradeSnapshot;

export type TransactionSpec = {
  type: TransactionType;
  normalize: (input: NormalizationInput) => TransactionRecord;
  reduce: TransactionReducer;
};

const applyBuy: TransactionReducer = (prev, transaction) => {
  if (transaction.valueMode !== 'components') {
    throw new Error(`BUY transactions need components.`);
  }

  if (transaction.netTransactionValue.gt(Money.zero())) {
    throw new Error(
      `BUY transactions were expected to have a negative NTV conventionally to indicate a cash outflow.`,
    );
  }

  // NTV is signed negative for buys, but we're tracking totalCost as the absolute value.
  const totalCostIncrease = transaction.netTransactionValue.multiply(-1);

  return {
    unitsOwned: prev.unitsOwned.add(transaction.units),
    totalCost: prev.totalCost.add(totalCostIncrease),
    totalCostChange: totalCostIncrease,
  };
};

const applyDrip = applyBuy;

// Transfers can be the first event for a ticker (e.g., external ACB seeding).
// Transfer principal cancels across a pair; fees increase ACB by project convention.
// Unpaired transfers establish or remove cost base.
const applyTrfIn: TransactionReducer = (prev, transaction, context) => {
  if (transaction.valueMode === 'netOnly') {
    throw new Error('TRF_IN transactions need units.');
  }

  const fees = transaction.fees ?? Money.zero();
  const explicitPrincipal =
    transaction.valueMode === 'components'
      ? transaction.netTransactionValue.subtract(fees)
      : undefined;
  const matches = context.pendingTransfers.filter(
    (pending) =>
      pending.ticker === transaction.ticker &&
      pending.units.equals(transaction.units) &&
      (explicitPrincipal === undefined || pending.principal.equals(explicitPrincipal)),
  );
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous TRF_IN: matching TRF_OUT rows ${matches.map((match) => match.row).join(', ')}.`,
    );
  }
  const match = matches[0];
  if (transaction.valueMode === 'potentiallyInferrable' && !match) {
    throw new Error(
      'Cannot infer TRF_IN value without a matching earlier TRF_OUT for the same ticker and units. Seed transfers require unit price or NTV.',
    );
  }

  // Restore the outgoing principal, not its fee-adjusted NTV: outgoing fees
  // already remain in totalCost. Only incoming fees are added here.
  const ntv =
    transaction.valueMode === 'components'
      ? transaction.netTransactionValue
      : match.principal.add(fees);
  if (ntv.lt(Money.zero())) {
    throw new Error('TRF_IN transactions were expected to have a positive NTV conventionally.');
  }
  const effect = {
    unitsOwned: prev.unitsOwned.add(transaction.units),
    totalCost: prev.totalCost.add(ntv),
    totalCostChange: ntv,
  };
  if (match) {
    context.pendingTransfers.splice(context.pendingTransfers.indexOf(match), 1);
  }
  return effect;
};

const applyTrfOut: TransactionReducer = (prev, transaction, context) => {
  if (transaction.valueMode === 'netOnly') {
    throw new Error('TRF_OUT transactions need units.');
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

  const globalAcbPerUnitSoFar = prev.totalCost.divide(prev.unitsOwned.valueOf());
  if (
    transaction.valueMode === 'components' &&
    globalAcbPerUnitSoFar.notEquals(transaction.unitPrice)
  ) {
    throw new Error(
      `[${transaction.row}]: globalAcbPerUnitSoFar ${globalAcbPerUnitSoFar} (${prev.totalCost} / ${prev.unitsOwned}) before the TRF_OUT transaction did not match the transaction's unitPrice ${transaction.unitPrice}.`,
    );
  }
  const ntv =
    transaction.valueMode === 'components'
      ? transaction.netTransactionValue
      : calculateNTV({
          principalDirection: -1,
          feeDirection: 1,
          units: transaction.units,
          unitPrice: globalAcbPerUnitSoFar,
          fees: transaction.fees,
        });
  if (ntv.gt(Money.zero())) {
    throw new Error('TRF_OUT transactions were expected to have a negative NTV conventionally.');
  }
  const effect = {
    unitsOwned: prev.unitsOwned.subtract(transaction.units),
    totalCost: prev.totalCost.add(ntv),
    totalCostChange: ntv,
  };
  context.pendingTransfers.push({
    row: transaction.row,
    ticker: transaction.ticker,
    units: transaction.units,
    principal: (transaction.fees ?? Money.zero()).subtract(ntv),
  });
  return effect;
};

const applySell: TransactionReducer = (prev, transaction) => {
  if (transaction.valueMode !== 'components') {
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
    totalCostChange: costBase.multiply(-1),
  };
};

const applyStakeReward: TransactionReducer = (prev, transaction) => {
  if (transaction.valueMode !== 'components') {
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
    totalCostChange: transaction.netTransactionValue,
  };
};

const applyNcdis: TransactionReducer = (prev, transaction) => {
  if (transaction.valueMode === 'potentiallyInferrable') {
    throw new Error('Only transfers can defer valuation.');
  }
  if (transaction.netTransactionValue.lt(Money.zero())) {
    throw new Error(
      'Non-cash distributions should have a positive conventional net transaction value.',
    );
  }

  return {
    totalCost: prev.totalCost.add(transaction.netTransactionValue),
    unitsOwned: prev.unitsOwned,
    totalCostChange: transaction.netTransactionValue,
  };
};

const applyRoc: TransactionReducer = (prev, transaction) => {
  if (transaction.valueMode === 'potentiallyInferrable') {
    throw new Error('Only transfers can defer valuation.');
  }
  if (transaction.netTransactionValue.lt(Money.zero())) {
    throw new Error('Returns of capital should have a positive conventional net transaction value');
  }

  return {
    totalCost: prev.totalCost.subtract(transaction.netTransactionValue),
    unitsOwned: prev.unitsOwned,
    totalCostChange: transaction.netTransactionValue.multiply(-1),
  };
};

// NTV = signed principal + signed fees. Transfers capitalize fees (+1);
// other transaction types retain their cash-flow fee convention (-1).
function calculateNTV({
  principalDirection,
  feeDirection,
  units,
  unitPrice,
  fees,
}: {
  principalDirection: 1 | -1;
  feeDirection: 1 | -1;
  units: Shares;
  unitPrice: Money;
  fees: Money | undefined;
}): Money {
  assertPositiveUnits(units);
  const feeValue = (fees ?? Money.zero()).multiply(feeDirection);
  return unitPrice.multiply(units.valueOf() * principalDirection).add(feeValue);
}

function calculateUnits({
  principalDirection,
  feeDirection,
  ntv,
  unitPrice,
  fees,
}: {
  principalDirection: 1 | -1;
  feeDirection: 1 | -1;
  ntv: Money;
  unitPrice: Money;
  fees: Money | undefined;
}): Shares {
  const feeValue = (fees ?? Money.zero()).multiply(feeDirection);
  const numerator = ntv.subtract(feeValue).multiply(principalDirection);
  const units = new Shares(numerator.divide(unitPrice));
  assertPositiveUnits(units);
  return units;
}

function calculateUnitPrice({
  principalDirection,
  feeDirection,
  ntv,
  units,
  fees,
}: {
  principalDirection: 1 | -1;
  feeDirection: 1 | -1;
  ntv: Money;
  units: Shares;
  fees: Money | undefined;
}): Money {
  assertPositiveUnits(units);
  const feeValue = (fees ?? Money.zero()).multiply(feeDirection);
  return ntv.subtract(feeValue).multiply(principalDirection).divide(units.valueOf());
}

/** Transaction quantities must be positive at share precision. */
function assertPositiveUnits(units: Shares): void {
  if (units.lte(Shares.zero())) {
    throw new Error('Units must be positive.');
  }
}

function incompleteTransaction(input: NormalizationInput): never {
  throw new Error(
    `Incomplete transaction data. Please make sure the provided unitPrice=${input.unitPrice}, units=${input.units}, and netTransactionValue=${input.netTransactionValue} makes sense for this transaction type=${input.type}.`,
  );
}

function normalizeInternal({
  input,
  type,
  principalDirection,
  feeDirection,
}: {
  input: NormalizationInput;
  type: TransactionType;
  principalDirection: 1 | -1;
  feeDirection: 1 | -1;
}): TransactionRecord {
  const {
    row,
    date,
    ticker,
    units: providedUnits,
    unitPrice: providedUnitPrice,
    netTransactionValue: providedNTV,
    fees,
  } = input;

  const base = {
    row,
    date,
    ticker,
    fees,
    type,
  };

  const hasProvidedUnits = providedUnits !== undefined;
  const hasProvidedPrice = providedUnitPrice !== undefined;
  const hasProvidedNtv = providedNTV !== undefined;

  const withComponents = (
    units: Shares,
    unitPrice: Money,
    netTransactionValue: Money,
  ): TransactionRecordWithComponents => ({
    ...base,
    valueMode: 'components',
    units,
    unitPrice,
    netTransactionValue,
  });

  if (hasProvidedUnits && hasProvidedPrice && hasProvidedNtv) {
    const expected = calculateNTV({
      principalDirection,
      feeDirection,
      fees,
      units: providedUnits,
      unitPrice: providedUnitPrice,
    });

    if (providedNTV.notEquals(expected)) {
      throw new Error(
        `Provided net transaction value ${providedNTV} did not match expected ${expected}.`,
      );
    }

    return withComponents(providedUnits, providedUnitPrice, providedNTV);
  }

  if (hasProvidedUnits && hasProvidedPrice && !hasProvidedNtv) {
    return withComponents(
      providedUnits,
      providedUnitPrice,
      calculateNTV({
        principalDirection,
        feeDirection,
        fees,
        units: providedUnits,
        unitPrice: providedUnitPrice,
      }),
    );
  }

  if (hasProvidedUnits && !hasProvidedPrice && hasProvidedNtv) {
    return withComponents(
      providedUnits,
      calculateUnitPrice({
        principalDirection,
        feeDirection,
        fees,
        units: providedUnits,
        ntv: providedNTV,
      }),
      providedNTV,
    );
  }

  if (!hasProvidedUnits && hasProvidedPrice && hasProvidedNtv) {
    return withComponents(
      calculateUnits({
        principalDirection,
        feeDirection,
        fees,
        unitPrice: providedUnitPrice,
        ntv: providedNTV,
      }),
      providedUnitPrice,
      providedNTV,
    );
  }

  if (hasProvidedUnits && !hasProvidedPrice && !hasProvidedNtv) {
    if (areValuesInferrable(type)) {
      assertPositiveUnits(providedUnits);
      return { ...base, type, valueMode: 'potentiallyInferrable', units: providedUnits };
    }

    return incompleteTransaction(input);
  }

  if (!hasProvidedUnits && !hasProvidedPrice && hasProvidedNtv) {
    if (onlyNetValueAllowed(type)) {
      return { ...base, type, valueMode: 'netOnly', netTransactionValue: providedNTV };
    }

    throw new Error(
      `Net-only transaction rows are only supported for ${NET_VALUE_ONLY_TRANSACTION_TYPES.join(', ')}.`,
    );
  }

  // (!hasProvidedUnits && hasProvidedPrice && !hasProvidedNtv) || (!hasProvidedUnits && !hasProvidedPrice && !hasProvidedNtv)
  return incompleteTransaction(input);
}

function createSpec({
  type,
  principalDirection,
  feeDirection,
  reduce,
}: {
  type: TransactionType;
  principalDirection: 1 | -1;
  feeDirection: 1 | -1;
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
        principalDirection,
        feeDirection,
      });
    },
    reduce,
  };
}

const TRANSACTION_SPECS: Record<TransactionType, TransactionSpec> = {
  [TRANSACTION_TYPE_TRF_IN]: createSpec({
    type: TRANSACTION_TYPE_TRF_IN,
    principalDirection: 1,
    feeDirection: 1,
    reduce: applyTrfIn,
  }),
  [TRANSACTION_TYPE_BUY]: createSpec({
    type: TRANSACTION_TYPE_BUY,
    principalDirection: -1,
    feeDirection: -1,
    reduce: applyBuy,
  }),
  [TRANSACTION_TYPE_DRIP]: createSpec({
    type: TRANSACTION_TYPE_DRIP,
    principalDirection: -1,
    feeDirection: -1,
    reduce: applyDrip,
  }),
  [TRANSACTION_TYPE_TRF_OUT]: createSpec({
    type: TRANSACTION_TYPE_TRF_OUT,
    principalDirection: -1,
    feeDirection: 1,
    reduce: applyTrfOut,
  }),
  [TRANSACTION_TYPE_SELL]: createSpec({
    type: TRANSACTION_TYPE_SELL,
    principalDirection: 1,
    feeDirection: -1,
    reduce: applySell,
  }),
  [TRANSACTION_TYPE_STAKE_REWARD]: createSpec({
    type: TRANSACTION_TYPE_STAKE_REWARD,
    principalDirection: 1,
    feeDirection: -1,
    reduce: applyStakeReward,
  }),
  [TRANSACTION_TYPE_NON_CASH_DIST]: createSpec({
    type: TRANSACTION_TYPE_NON_CASH_DIST,
    principalDirection: 1,
    feeDirection: -1,
    reduce: applyNcdis,
  }),
  [TRANSACTION_TYPE_RETURN_OF_CAPITAL]: createSpec({
    type: TRANSACTION_TYPE_RETURN_OF_CAPITAL,
    principalDirection: 1,
    feeDirection: -1,
    reduce: applyRoc,
  }),
};

export function getTransactionSpec(type: TransactionType): TransactionSpec {
  return TRANSACTION_SPECS[type];
}
