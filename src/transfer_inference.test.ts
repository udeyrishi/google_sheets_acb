import { calculateAggregates } from './aggregation';
import { calculateColumnIndices, parseTransactionRecord } from './parser';
import { ACB_UNIT, TRANSACTION_EFFECTS, UNITS_OWNED } from './main';
import type { SheetTable } from './g_sheet_types';

// Keep only sheet-parsing plumbing shared; each test declares its full transaction history.
function parseTransactions(data: SheetTable) {
  const indices = calculateColumnIndices(data[0]);
  return data.slice(1).map((row, i) => parseTransactionRecord(i + 2, row, indices));
}

function aggregate(data: SheetTable, filter?: { ticker?: string; date?: Date }) {
  return calculateAggregates(parseTransactions(data), filter);
}

describe('Transfer inference', () => {
  it('restores all units and ACB after a full transfer without fees', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
    ];

    const effects = TRANSACTION_EFFECTS(data);
    expect(effects[2]).toEqual([-100, 0, 0, 0, undefined]);
    expect(effects[3]).toEqual([100, 100, 10, 10, undefined]);
    expect(ACB_UNIT('ABC', data)).toBe(10);
    expect(UNITS_OWNED('ABC', data)).toBe(10);
  });

  it('capitalizes both fees on a full inferred transfer', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', 5, ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', 2, ''],
    ];

    const effects = TRANSACTION_EFFECTS(data);
    expect(effects[2]).toEqual([-95, 5, 0, 0, undefined]);
    expect(effects[3]).toEqual([102, 107, 10.7, 10, undefined]);
    expect(ACB_UNIT('ABC', data)).toBe(10.7);
    expect(UNITS_OWNED('ABC', data)).toBe(10);
  });

  it('uses the outgoing cost despite intervening buys changing the average', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 4, '', 1, ''],
      ['BUY', new Date('2024-01-01'), 'ABC', 2, 20, 0, ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 4, '', 2, ''],
    ];

    const { aggregates, effects } = aggregate(data);
    expect(effects[1].totalCostChange.valueOf()).toBe(-39);
    expect(effects[3].totalCostChange.valueOf()).toBe(42);
    expect(aggregates.ABC.totalCost.valueOf()).toBe(143);
    expect(aggregates.ABC.unitsOwned.valueOf()).toBe(12);
  });

  it('infers an incoming transfer from an explicitly valued outgoing transfer', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, 10, 5, -95],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', 2, ''],
    ];

    const { aggregates } = aggregate(data);
    expect(aggregates.ABC.totalCost.valueOf()).toBe(107);
    expect(aggregates.ABC.unitsOwned.valueOf()).toBe(10);
  });

  it('accepts explicit incoming value after an inferred outgoing transfer', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', 5, ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, 2, 102],
    ];

    const { aggregates } = aggregate(data);
    expect(aggregates.ABC.totalCost.valueOf()).toBe(107);
    expect(aggregates.ABC.unitsOwned.valueOf()).toBe(10);
  });

  it('rejects reusing an explicit outgoing transfer for a second inferred incoming transfer', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, 10, 5, -95],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', 2, ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
    ];

    expect(() => aggregate(data)).toThrow(
      /^\[row: 5\]: Failed to digest the transaction[\s\S]*Cannot infer TRF_IN/,
    );
  });

  it('rejects reusing an inferred outgoing transfer after an explicit incoming transfer', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', 5, ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, 2, 102],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
    ];

    expect(() => aggregate(data)).toThrow(
      /^\[row: 5\]: Failed to digest the transaction[\s\S]*Cannot infer TRF_IN/,
    );
  });

  it('does not mutate parsed records or retain consumed context between runs', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
    ];

    const records = parseTransactions(data).map((record) => Object.freeze(record));
    expect(calculateAggregates(records).aggregates.ABC.totalCost.valueOf()).toBe(100);
    expect(calculateAggregates(records).aggregates.ABC.totalCost.valueOf()).toBe(100);
    expect(records[1].unitPrice).toBeUndefined();
    expect(records[1].netTransactionValue).toBeUndefined();
  });

  it('does not carry an unmatched outgoing transfer into another aggregation call', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
    ];

    aggregate(data);

    const separateData = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-02'), 'ABC', 10, '', '', ''],
    ];
    expect(() => aggregate(separateData)).toThrow(
      /^\[row: 2\]: Failed to digest the transaction[\s\S]*Seed transfers require unit price or NTV/,
    );
  });

  it('requires explicit value for an initial seed transfer', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
    ];

    expect(() => aggregate(data)).toThrow(
      /^\[row: 2\]: Failed to digest the transaction[\s\S]*Seed transfers require unit price or NTV/,
    );
  });

  it('does not infer incoming value from existing holdings alone', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
    ];

    expect(() => aggregate(data)).toThrow(
      /^\[row: 3\]: Failed to digest the transaction[\s\S]*Cannot infer TRF_IN/,
    );
  });

  it('does not match an outgoing transfer for a different ticker', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'XYZ', 10, '', '', ''],
    ];

    expect(() => aggregate(data)).toThrow(
      /^\[row: 4\]: Failed to digest the transaction[\s\S]*Cannot infer TRF_IN/,
    );
  });

  it('does not split an outgoing transfer to match a smaller incoming transfer', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 5, '', '', ''],
    ];

    expect(() => aggregate(data)).toThrow(
      /^\[row: 4\]: Failed to digest the transaction[\s\S]*Cannot infer TRF_IN/,
    );
  });

  it('does not match an outgoing transfer that appears later in input order', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
    ];

    expect(() => aggregate(data)).toThrow(
      /^\[row: 3\]: Failed to digest the transaction[\s\S]*Cannot infer TRF_IN/,
    );
  });

  it('does not reuse an outgoing transfer after an inferred pair', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
    ];

    expect(() => aggregate(data)).toThrow(
      /^\[row: 5\]: Failed to digest the transaction[\s\S]*Cannot infer TRF_IN/,
    );
  });

  it('does not combine smaller outgoing transfers', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 5, '', '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 5, '', '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
    ];

    expect(() => aggregate(data)).toThrow(
      /^\[row: 5\]: Failed to digest the transaction[\s\S]*Cannot infer TRF_IN/,
    );
  });

  it('rejects ambiguous matches with source row details', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 2, '', '', ''],
      ['BUY', new Date('2024-01-01'), 'ABC', 2, 20, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 2, '', '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 2, '', '', ''],
    ];

    expect(() => aggregate(data)).toThrow(
      /^\[row: 6\]: Failed to digest the transaction[\s\S]*Ambiguous TRF_IN: matching TRF_OUT rows 3, 5/,
    );
  });

  it('uses explicit incoming value to disambiguate outgoing transfers', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 2, '', '', ''],
      ['BUY', new Date('2024-01-01'), 'ABC', 2, 20, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 2, '', '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 2, 10, '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 2, '', '', ''],
    ];

    const { aggregates } = aggregate(data);
    expect(aggregates.ABC.totalCost.valueOf()).toBe(140);
    expect(aggregates.ABC.unitsOwned.valueOf()).toBe(12);
  });

  it('allows an explicit external seed without consuming a different-cost transfer', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 20, '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
    ];

    const { aggregates } = aggregate(data);
    expect(aggregates.ABC.totalCost.valueOf()).toBe(300);
  });

  it('matches fractional units at Shares precision', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 0.1 + 0.2, '', '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 0.3, '', '', ''],
    ];

    const { aggregates } = aggregate(data);
    expect(aggregates.ABC.unitsOwned.valueOf()).toBeCloseTo(10, 10);
    expect(aggregates.ABC.totalCost.valueOf()).toBeCloseTo(100, 10);
  });

  it('preserves fractional principal without rounding the inferred unit price', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 3, '', '', 100],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 1, '', '', ''],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 1, '', '', ''],
    ];

    const { aggregates, effects } = aggregate(data);
    expect(effects[1].totalCostChange.valueOf()).toBeCloseTo(-100 / 3, 10);
    expect(aggregates.ABC.totalCost.valueOf()).toBeCloseTo(100, 10);
  });

  it('allows an unmatched outgoing transfer when the cutoff excludes the incoming leg', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
      ['TRF_IN', new Date('2024-01-02'), 'ABC', 10, '', '', ''],
    ];

    const result = aggregate(data, { ticker: 'ABC', date: new Date('2024-01-02') });
    expect(result.effects).toHaveLength(2);
    expect(UNITS_OWNED('ABC', data, new Date('2024-01-02'))).toBe(0);
    expect(UNITS_OWNED('ABC', data, new Date('2024-01-03'))).toBe(10);
  });

  it('rejects an outgoing transfer without any holdings', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 10, '', '', ''],
    ];

    expect(() => aggregate(data)).toThrow(
      /^\[row: 2\]: Failed to digest the transaction[\s\S]*without owning any units/,
    );
  });

  it('rejects an outgoing transfer larger than the current holdings', () => {
    const data = [
      ['Type', 'Date', 'Ticker', 'Units', 'Unit Price', 'Fees', 'Net Transaction Value'],
      ['TRF_IN', new Date('2024-01-01'), 'ABC', 10, 10, '', ''],
      ['TRF_OUT', new Date('2024-01-01'), 'ABC', 11, '', '', ''],
    ];

    expect(() => aggregate(data)).toThrow(
      /^\[row: 3\]: Failed to digest the transaction[\s\S]*Cannot transfer out more units/,
    );
  });
});
