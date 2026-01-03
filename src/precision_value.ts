export abstract class PrecisionValue<T extends PrecisionValue<T>> {
  private readonly precision: number;
  protected readonly value: number;

  protected constructor(value: number, precision: number) {
    if (!Number.isFinite(value)) {
      throw new Error(`Value must be finite, received: ${value}`);
    }
    if (!Number.isInteger(precision) || precision < 0) {
      throw new Error(`Precision must be a non-negative integer, received: ${precision}`);
    }

    this.value = value;
    this.precision = precision;
  }

  protected abstract create(value: number): T;

  valueOf(): number {
    return this.value;
  }

  roundToPrecision(): number {
    const factor = Math.pow(10, this.precision);
    const scaled = this.value * factor;
    const floored = Math.floor(scaled);
    const change = scaled - floored;
    const rounded = change >= 0.5 ? floored + 1 : floored;
    return rounded / factor;
  }

  toJSON(): number {
    return this.roundToPrecision();
  }

  add(other: T): T {
    return this.create(this.value + other.value);
  }

  subtract(other: T): T {
    return this.create(this.value - other.value);
  }

  multiply(scalar: number): T {
    return this.create(this.value * scalar);
  }

  divide(scalar: number): T;
  divide(other: T): number;

  divide(divisor: number | T): T | number {
    const divisorValue = typeof divisor === 'number' ? divisor : divisor.value;
    if (divisorValue === 0) {
      throw new Error('Cannot divide by zero.');
    }

    if (typeof divisor === 'number') {
      return this.create(this.value / divisor);
    }

    return this.value / divisor.value;
  }

  equals(other: T): boolean {
    return this.roundToPrecision() === other.roundToPrecision();
  }

  notEquals(other: T): boolean {
    return !this.equals(other);
  }

  lt(other: T): boolean {
    if (this.equals(other)) {
      return false;
    }
    return this.value < other.value;
  }

  lte(other: T): boolean {
    return this.equals(other) || this.lt(other);
  }

  gt(other: T): boolean {
    if (this.equals(other)) {
      return false;
    }
    return this.value > other.value;
  }

  gte(other: T): boolean {
    return this.equals(other) || this.gt(other);
  }
}
