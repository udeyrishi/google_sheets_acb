import { PrecisionValue } from './precision_value';

const MONEY_PRECISION = 2;

export class Money extends PrecisionValue<Money> {
  constructor(value: number) {
    super(value, MONEY_PRECISION);
  }

  static zero(): Money {
    return new Money(0);
  }

  protected create(value: number): Money {
    return new Money(value);
  }

  toString(): string {
    return this.roundToPrecision().toPrecision(4);
  }
}
