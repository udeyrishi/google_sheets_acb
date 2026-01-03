import { Money } from './money';

describe('Money', () => {
  it('stores numeric values', () => {
    const value = new Money(12.3456);
    expect(value.valueOf()).toBe(12.3456);
  });

  it('uses precision-aware equality', () => {
    const left = new Money(10.001);
    const right = new Money(10.0019);

    expect(left).toEqual(right);
    expect(left).toEqual(right);
    expect(left.notEquals(right)).toBe(false);
  });

  it('adds and subtracts money values', () => {
    const left = new Money(5.5);
    const right = new Money(2.25);

    expect(left.add(right)).toEqual(new Money(7.75));
    expect(left.subtract(right)).toEqual(new Money(3.25));
  });

  it('multiplies and divides by scalars', () => {
    const value = new Money(10);

    expect(value.multiply(2.5)).toEqual(new Money(25));
    const divided = value.divide(4);
    expect(divided).toEqual(new Money(2.5));
  });

  it('divides by another Money to return a ratio', () => {
    const value = new Money(10);
    const ratio = value.divide(new Money(4));

    expect(ratio).toBe(2.5);
  });

  it('throws when dividing by zero', () => {
    const value = new Money(10);

    expect(() => value.divide(0)).toThrow(/divide/);
    expect(() => value.divide(new Money(0))).toThrow(/divide/);
  });

  it('compares ordering with precision awareness', () => {
    const base = new Money(10.001);
    const higher = new Money(10.01);
    const lower = new Money(9.99);

    expect(base.lessThan(higher)).toBe(true);
    expect(base.greaterThan(lower)).toBe(true);
    expect(base.lessThan(new Money(10.0015))).toBe(false);
    expect(base.greaterThan(new Money(10.0015))).toBe(false);
  });

  it('formats using fixed precision', () => {
    const value = new Money(12.3);

    expect(value.toString()).toBe('Money[12.300]');
    expect(value.toJSON()).toBe('Money[12.300]');
  });

  it('ignores floating point precision oddities', () => {
    const precise = new Money(7.8);
    expect(precise.valueOf()).toBe(7.8);

    const notSoPrecise = new Money(3 * 14 - 2) // 40
      .subtract(new Money((161 / 15) * 3)); // minus 32.2
    expect(notSoPrecise.valueOf()).not.toBe(7.8);

    expect(precise).toEqual(notSoPrecise);
  });
});
