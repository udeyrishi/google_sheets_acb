import { Money } from './money';
import { Shares } from './shares';

const areEqualMonies = (a: unknown, b: unknown) => {
  const isAMoney = a instanceof Money;
  const isBMoney = b instanceof Money;

  if (isAMoney && isBMoney) {
    return a.equals(b);
  }
  if (!isAMoney && !isBMoney) {
    return undefined;
  }
  return false;
};

const areEqualShares = (a: unknown, b: unknown) => {
  const isAShares = a instanceof Shares;
  const isBShares = b instanceof Shares;

  if (isAShares && isBShares) {
    return a.equals(b);
  }
  if (!isAShares && !isBShares) {
    return undefined;
  }
  return false;
};

// @ts-expect-error ts-jest is still outdated, and doesn't have visibility into this legal API.
expect.addEqualityTesters([areEqualMonies, areEqualShares]);
