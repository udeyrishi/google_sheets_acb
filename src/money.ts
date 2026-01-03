const MONEY_PRECISION = 3;

export class Money {
  private readonly value: number;

  constructor(value: number) {
    if (!Number.isFinite(value)) {
      throw new Error(`Money value must be finite, received: ${value}`);
    }

    this.value = value;
  }

  static zero(): Money {
    return new Money(0);
  }

  static fromNumber(value: number): Money {
    return new Money(value);
  }

  valueOf(): number {
    return this.value;
  }

  toString(): string {
    return `Money[${this.value.toFixed(MONEY_PRECISION)}]`;
  }

  toJSON(): string {
    return this.toString();
  }

  add(other: Money): Money {
    return new Money(this.value + other.value);
  }

  subtract(other: Money): Money {
    return new Money(this.value - other.value);
  }

  multiply(scalar: number): Money {
    return new Money(this.value * scalar);
  }

  divide(scalar: number): Money;
  divide(money: Money): number;

  divide(divisor: number | Money): Money | number {
    if ((typeof divisor === 'number' && divisor === 0) || divisor.valueOf() === 0) {
      throw new Error('Cannot divide money by zero.');
    }

    if (typeof divisor === 'number') {
      return new Money(this.value / divisor);
    } else {
      return this.value / divisor.value;
    }
  }

  equals(other: Money): boolean {
    const epsilon = Math.pow(10, -MONEY_PRECISION);
    return Math.abs(this.value - other.value) < epsilon;
  }

  notEquals(other: Money): boolean {
    return !this.equals(other);
  }

  lessThan(other: Money): boolean {
    if (this.equals(other)) {
      return false;
    }
    return this.value < other.value;
  }

  greaterThan(other: Money): boolean {
    if (this.equals(other)) {
      return false;
    }
    return this.value > other.value;
  }
}
