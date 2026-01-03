import { Shares } from './shares';

describe('Shares', () => {
  it('stores numeric values', () => {
    const value = new Shares(123.456);
    expect(value.valueOf()).toBe(123.456);
  });

  it('rounds to the nearest 10th decimal place', () => {
    const raw = new Shares(108113.99999999997);
    const rounded = new Shares(108114);

    expect(raw).toEqual(rounded);
  });

  it('adds and subtracts share counts', () => {
    const left = new Shares(10.5);
    const right = new Shares(2.25);

    expect(left.add(right)).toEqual(new Shares(12.75));
    expect(left.subtract(right)).toEqual(new Shares(8.25));
  });

  it('multiplies and divides by scalars', () => {
    const value = new Shares(10);

    expect(value.multiply(2.5)).toEqual(new Shares(25));
    const divided = value.divide(4);
    expect(divided).toEqual(new Shares(2.5));
  });

  it('divides by another Shares to return a ratio', () => {
    const value = new Shares(10);
    const ratio = value.divide(new Shares(4));

    expect(ratio).toBe(2.5);
  });

  it('throws when dividing by zero', () => {
    const value = new Shares(10);

    expect(() => value.divide(0)).toThrow(/divide/);
    expect(() => value.divide(new Shares(0))).toThrow(/divide/);
  });
});
