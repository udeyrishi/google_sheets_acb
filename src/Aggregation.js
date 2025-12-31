const _IS_NODE = module?.exports;

const {
  _TRANSACTION_TYPE_TRF_IN,
  _TRANSACTION_TYPE_BUY,
  _TRANSACTION_TYPE_DRIP,
  _TRANSACTION_TYPE_TRF_OUT,
  _TRANSACTION_TYPE_SELL,
  _TRANSACTION_TYPE_STAKE_REWARD,
  _TRANSACTION_TYPE_NON_CASH_DIST,
  _TRANSACTION_TYPE_RETURN_OF_CAPITAL,
} = _IS_NODE ? require("./Constants") : globalThis;

function _applyBuy(prev, transaction) {
  return {
    unitsOwned: prev.unitsOwned + transaction.units,
    totalCost: prev.totalCost + (transaction.unitPrice * transaction.units) + transaction.fees,
    gain: 0,
  }
}

function _applyNoop(prev) {
  return {
    unitsOwned: prev.unitsOwned,
    totalCost: prev.totalCost,
    gain: 0,
  }
}

const _applyTrfIn = _applyNoop
const _applyDrip = _applyBuy
const _applyTrfOut = _applyNoop

function _applySell(prev, transaction) {
  if (prev.unitsOwned <= 0) {
    throw new Error(`[${transaction.row}]: Cannot have a Sell transaction without owning any units.`)
  }
  if (transaction.units > prev.unitsOwned) {
    throw new Error(`[${transaction.row}]: Cannot sell more units than owned.`)
  }

  const globalAcbPerUnitSoFar = prev.totalCost / prev.unitsOwned;
  const costBase = globalAcbPerUnitSoFar * transaction.units
  const proceedsOfSale = (transaction.units * transaction.unitPrice) - transaction.fees

  return {
    unitsOwned: prev.unitsOwned - transaction.units,
    // Note that transaction.fees does not get added to the ACB on sale. It only reduces the net gains.
    // Do not add transaction.fees here.
    totalCost: prev.totalCost - costBase,
    gain: proceedsOfSale - costBase,
  }
}

function _applyStakeReward(prev, transaction) {
  return {
    unitsOwned: prev.unitsOwned + transaction.units,
    totalCost: prev.totalCost,
    gain: 0,
  }
}

function _applyNcdis(prev, transaction) {
  if (transaction.netTransactionValue < 0) {
    throw new Error(
      `[${transaction.row}]: Non-cash distributions should have a positive nominal net transaction value.`
    )
  }

  return {
    totalCost: prev.totalCost + transaction.netTransactionValue,
    unitsOwned: prev.unitsOwned,
    gain: 0,
  }
}

function _applyRoc(prev, transaction) {
  if (transaction.netTransactionValue < 0) {
    throw new Error(
      `[${transaction.row}]: Returns of capital should have a positive nominal net transaction value`
    )
  }

  return {
    totalCost: prev.totalCost - transaction.netTransactionValue,
    unitsOwned: prev.unitsOwned,
    gain: 0,
  }
}

const REDUCERS = {
  [_TRANSACTION_TYPE_TRF_IN]: _applyTrfIn,
  [_TRANSACTION_TYPE_BUY]: _applyBuy,
  [_TRANSACTION_TYPE_DRIP]: _applyDrip,
  [_TRANSACTION_TYPE_TRF_OUT]: _applyTrfOut,
  [_TRANSACTION_TYPE_SELL]: _applySell,
  [_TRANSACTION_TYPE_STAKE_REWARD]: _applyStakeReward,
  [_TRANSACTION_TYPE_NON_CASH_DIST]: _applyNcdis,
  [_TRANSACTION_TYPE_RETURN_OF_CAPITAL]: _applyRoc,
}

function _calculateAggregates(transactions) {
  const { aggregates, effects } = transactions.reduce(({ aggregates, effects }, transaction, i) => {
    if (!(transaction.type in REDUCERS)) {
      throw new Error(`[${transaction.row}]: Unknown transaction type: ${transaction.type}`)
    }

    const previousTransaction = i > 0 ? transactions[i - 1] : null;
    if (previousTransaction && transaction.date.getTime() < previousTransaction.date.getTime()) {
      throw new Error(`[${transaction.row}]: Transaction date is less than the previous transaction date ${previousTransaction.date}`)
    }

    const prev = aggregates[transaction.ticker] ?? {
      unitsOwned: 0,
      totalCost: 0,
    }

    const effect = REDUCERS[transaction.type](prev, transaction)

    return {
      aggregates: {
        ...aggregates,
        [transaction.ticker]: {
          unitsOwned: effect.unitsOwned,
          totalCost: effect.totalCost,
        },
      },
      effects: [...effects, effect],
    }
  }, {
    aggregates: {},
    effects: [],
    /**
     * aggregates: { [ticker]: { unitsOwned: number, totalCost: number } }
     * effects: [ {unitsOwned: number, totalCost: number, gain?: number | undefined } ]
     */
  })

  return {
    aggregates,
    effects,
  }
}

if (module?.exports) {
  module.exports = {
    _calculateAggregates,
  };
}
