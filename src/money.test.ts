import { Money } from './money';

describe('Money', () => {
  it('uses precision-aware equality', () => {
    const left = new Money(10.001);
    const right = new Money(10.0019);

    expect(left).toEqual(right);
    expect(left).toEqual(right);
    expect(left.notEquals(right)).toBe(false);
  });

  it.each([
    [10.0049, 10.0],
    [10.0051, 10.01],
    [10.001, 10.0],
    [10.0019, 10.0],
  ])('new Money(%p) rounds to new Money(%p)', (left, right) => {
    expect(new Money(left)).toEqual(new Money(right));
  });

  it('adds and subtracts money values', () => {
    const left = new Money(5.5);
    const right = new Money(2.25);

    expect(left.add(right)).toEqual(new Money(7.75));
    expect(left.subtract(right)).toEqual(new Money(3.25));
  });

  it('subtracts values after rounding each operand', () => {
    const left = new Money(10.005); // rounds to 10.01
    const right = new Money(0.001); // rounds to 0.00

    // subtract after rounding gives: 10.01 - 0.00 => 10.01
    // subtract before rounding gives: 10.005 - 0.001 => 10.004 => 10.00

    const result = left.subtract(right);
    expect(result).toEqual(new Money(10.0));
    expect(result).not.toEqual(new Money(10.01));
  });

  it('adds values with high precision', () => {
    const left = new Money(5.5246);
    const right = new Money(2.2532);
    const sum = left.add(right);

    // Money retained high precision internally. The operands were kept at
    // full precision, added, and then rounded. If the rounding had occurred
    // prior to adding, the sum would've been 5.52 + 2.25 = 7.77
    expect(sum).toEqual(new Money(7.7778));
    expect(sum).toEqual(new Money(7.78));
    expect(sum).not.toEqual(new Money(7.77));
    expect(sum.toNearestCent()).toEqual(7.78);
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
    expect(base.equals(new Money(10.0015))).toBe(true);
  });

  it('formats using fixed precision', () => {
    const value = new Money(12.3);

    expect(value.toString()).toBe('12.30');
    expect(value.toJSON()).toBe(12.3);
  });

  it('ignores floating point precision oddities', () => {
    const precise = new Money(7.8);
    expect(precise.valueOf()).toBe(7.8);

    const notSoPrecise = new Money(3 * 14 - 2) // 40
      .subtract(new Money((161 / 15) * 3)); // minus 32.2
    expect(notSoPrecise.valueOf()).not.toBe(7.8);

    expect(precise).toEqual(notSoPrecise);
  });

  it('rounds to the nearest cent', () => {
    expect(new Money(10.001).toNearestCent()).toEqual(10.0);
    expect(new Money(10.004).toNearestCent()).toEqual(10.0);
    expect(new Money(10.0049).toNearestCent()).toEqual(10.0);
    expect(new Money(10.005).toNearestCent()).toEqual(10.01);
    expect(new Money(12.3456).toNearestCent()).toBe(12.35);
  });
});
