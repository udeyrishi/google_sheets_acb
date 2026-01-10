import type { Money } from './money';
import type { Shares } from './shares';
import type { Ticker } from './transaction_record';

export type PositionSnapshot = {
  unitsOwned: Shares;
  totalCost: Money;
};

export type PortfolioPositions = Record<Ticker, PositionSnapshot>;

export type PostTradeSnapshot = PositionSnapshot & {
  gain?: Money;
};

export type AggregateResult = {
  aggregates: PortfolioPositions;
  effects: readonly PostTradeSnapshot[];
};
