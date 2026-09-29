import type { Money } from './money';
import type { Shares } from './shares';
import type { Ticker } from './transaction_record';

export type PositionSnapshot = {
  unitsOwned: Shares;
  totalCost: Money;
};

export type PortfolioPositions = Record<Ticker, PositionSnapshot>;

export type PostTradeSnapshot = PositionSnapshot & {
  totalCostChange: Money;
  gain?: Money;
};

export type AggregateResult = {
  aggregates: PortfolioPositions;
  effects: readonly PostTradeSnapshot[];
};

/** Principal excludes outgoing fees, which are already capitalized in the position. */
export type PendingTransfer = {
  row: number;
  ticker: Ticker;
  units: Shares;
  principal: Money;
};

/** Private to one aggregation run; successful incoming transfers consume entries once. */
export type AggregationContext = {
  pendingTransfers: PendingTransfer[];
};
