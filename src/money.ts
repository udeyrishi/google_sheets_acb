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

  valueOf(): number {
    return this.value;
  }

  toNearestCent(): number {
    const cents = this.value * 100;
    const centsFloored = Math.floor(cents);

    const change = cents - centsFloored;

    if (change >= 0.5) {
      return (centsFloored + 1) / 100;
    } else {
      return centsFloored / 100;
    }
  }

  toString(): string {
    return `${this.toNearestCent().toPrecision(4)}`;
  }

  toJSON(): number {
    return this.toNearestCent();
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
    if (
      (typeof divisor === 'number' && divisor === 0) ||
      (divisor instanceof Money && divisor.value === 0)
    ) {
      throw new Error('Cannot divide money by zero.');
    }

    if (typeof divisor === 'number') {
      return new Money(this.value / divisor);
    } else {
      return this.value / divisor.value;
    }
  }

  equals(other: Money): boolean {
    return this.toNearestCent() === other.toNearestCent();
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
