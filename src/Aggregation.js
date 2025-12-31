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
  }
}

const _applyTrfIn = _applyBuy
const _applyDrip = _applyBuy

function _applyTrfOut(prev, transaction) {
  if (prev.unitsOwned <= 0) {
    throw new Error(`[${transaction.row}]: Cannot have a TRF_OUT transaction without owning any units.`)
  }

  const accountAcbSoFar = prev.totalCost / prev.unitsOwned;

  if (accountAcbSoFar !== transaction.unitPrice) {
    throw new Error(`[${transaction.row}]: accountAcbSoFar ${accountAcbSoFar} (${prev.totalCost} / ${prev.unitsOwned}) before the TRF_OUT transaction did not match the transaction's unitPrice ${transaction.unitPrice}.`)
  }

  return {
    unitsOwned: prev.unitsOwned - transaction.units,
    totalCost: prev.totalCost - (accountAcbSoFar * transaction.units) + transaction.fees,
  }
}

function _applySell(prev, transaction) {
  if (prev.unitsOwned <= 0) {
    throw new Error(`[${transaction.row}]: Cannot have a Sell transaction without owning any units.`)
  }

  const accountAcbSoFar = prev.totalCost / prev.unitsOwned;

  return {
    unitsOwned: prev.unitsOwned - transaction.units,
    // Note that transaction.fees does not get added to the ACB on sale. It only reduces the net gains.
    // Do not add transaction.fees here.
    totalCost: prev.totalCost - (accountAcbSoFar * transaction.units),
  }
}

function _applyStakeReward(prev, transaction) {
  return {
    unitsOwned: prev.unitsOwned + transaction.units,
    totalCost: prev.totalCost,
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
  const { accounts: accountAggregations, effects } = transactions.reduce(({ accounts, effects }, transaction, i) => {
    if (!(transaction.type in REDUCERS)) {
      throw new Error(`[${transaction.row}]: Unknown transaction type: ${transaction.type}`)
    }

    const previousTransaction = i > 0 ? transactions[i - 1] : null;
    if (previousTransaction && transaction.date.getTime() < previousTransaction.date.getTime()) {
      throw new Error(`[${transaction.row}]: Transaction date is less than the previous transaction date ${previousTransaction.date}`)
    }

    const accountAssets = accounts[transaction.account] ?? {}

    const prev = accountAssets[transaction.ticker] ?? {
      unitsOwned: 0,
      totalCost: 0,
    }

    const reduced = REDUCERS[transaction.type](prev, transaction)

    return {
      accounts: {
        ...accounts,
        [transaction.account]: {
          ...accountAssets,
          [transaction.ticker]: reduced,
        },
      },
      effects: [...effects, reduced]
    }
  }, {
    accounts: {},
    effects: [],
    /**
     * accounts: {
     *   [account]: {
     *     [ticker]: { unitsOwned: number, totalCost: number }
     *   },
     * effects: [ {unitsOwned: number, totalCost: number} ]
     * }
     */
  })

  const overallAggregates = [...Object.values(accountAggregations)].reduce((aggregatedAcrossAccounts, perAccountInfo) => {
    return [...Object.entries(perAccountInfo)].reduce((agg, [ticker, { unitsOwned, totalCost }]) => {
      const prev = agg[ticker] ?? { unitsOwned: 0, totalCost: 0 }
      const next = {
        unitsOwned: prev.unitsOwned + unitsOwned,
        totalCost: prev.totalCost + totalCost,
      }

      return {
        ...agg,
        [ticker]: next,
      }
    }, aggregatedAcrossAccounts)
  }, {
    /**
     * [ticker] : { unitsOwned: number; totalCost: number }
     */
  });

  return {
    overallAggregates,
    accounts: accountAggregations,
    effects,
  }
}

if (module?.exports) {
  module.exports = {
    _calculateAggregates,
  };
}

