import { Money } from './money';
import { Shares } from './shares';
import type { Ticker, TransactionRecord } from './transaction_record';
import type {
  AggregateResult,
  AggregationContext,
  PortfolioPositions,
  PositionSnapshot,
  PostTradeSnapshot,
} from './aggregation_types';
import { getTransactionSpec } from './transaction_specs';
import { formatErrorCause } from './utils';

/**
 * Checks that transaction timestamps are nondecreasing; equal timestamps are allowed.
 * @throws {Error} If a transaction precedes the previous transaction, identifying its row.
 */
function assertAreChronological(transactions: readonly TransactionRecord[]) {
  let previousTransaction: TransactionRecord | undefined;

  for (const transaction of transactions) {
    if (previousTransaction && transaction.date.getTime() < previousTransaction.date.getTime()) {
      throw new Error(
        `[${transaction.row}]: Transaction date is less than the previous transaction date ${previousTransaction.date}`,
      );
    }

    previousTransaction = transaction;
  }
}

/**
 * Validates chronological order across all transactions, then aggregates matching rows.
 * Optional ticker and exclusive date filters restrict both aggregates and effects.
 */
export function calculateAggregates(
  transactions: readonly TransactionRecord[],
  filter?: { ticker?: Ticker; date?: Date },
): AggregateResult {
  assertAreChronological(transactions);

  const scopedTransactions = filter
    ? transactions.filter(
        (transaction) =>
          (filter.ticker === undefined || transaction.ticker === filter.ticker) &&
          (filter.date === undefined || transaction.date.getTime() < filter.date.getTime()),
      )
    : transactions;

  const context: AggregationContext = { pendingTransfers: [] };

  return scopedTransactions.reduce(
    ({ aggregates, effects }, transaction) => {
      const prev = aggregates[transaction.ticker] ?? {
        unitsOwned: Shares.zero(),
        totalCost: Money.zero(),
      };

      const spec = getTransactionSpec(transaction.type);

      try {
        const effect = spec.reduce(prev, transaction, context);

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
