import { PrecisionValue } from './precision_value';

const SHARES_PRECISION = 10;

export class Shares extends PrecisionValue<Shares> {
  constructor(value: number) {
    super(value, SHARES_PRECISION);
  }

  static zero(): Shares {
    return new Shares(0);
  }

  protected create(value: number): Shares {
    return new Shares(value);
  }

  toString(): string {
    return `${this.roundToPrecision()}`;
  }
}
