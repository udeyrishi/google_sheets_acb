import { Money } from './money';

const areEqualMonies = (a: unknown, b: unknown) => {
  const isAMoney = a instanceof Money;
  const isBMoney = b instanceof Money;

  if (isAMoney && isBMoney) {
    return a.equals(b);
  } else if (isAMoney === isBMoney) {
    return undefined;
  } else {
    return false;
  }
};

// @ts-expect-error ts-jest is still outdated, and doesn't have visibility into this legal API.
expect.addEqualityTesters([areEqualMonies]);
