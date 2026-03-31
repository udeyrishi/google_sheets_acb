import { Money } from './money';
import { Shares } from './shares';
import type { TransactionRecord } from './transaction_record';
import type {
  AggregateResult,
  PortfolioPositions,
  PositionSnapshot,
  PostTradeSnapshot,
} from './aggregation_types';
import { getTransactionSpec } from './transaction_specs';
import { formatErrorCause } from './utils';

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
        unitsOwned: Shares.zero(),
        totalCost: Money.zero(),
      };

      const spec = getTransactionSpec(transaction.type);

      try {
        const effect = spec.reduce(prev, transaction);

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
