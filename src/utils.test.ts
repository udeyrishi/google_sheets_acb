import { formatErrorCause, getTaxReportYear } from './utils';

describe('formatErrorCause', () => {
  it('formats non-error causes with indentation', () => {
    expect(formatErrorCause('boom')).toBe('Cause:\nboom');
    expect(formatErrorCause('boom', 2)).toBe('    Cause:\n    boom');
  });

  it('formats errors with indentation', () => {
    const error = new Error('Top failure');

    expect(formatErrorCause(error)).toContain('Cause:\nError: Top failure');
    expect(formatErrorCause(error, 2)).toContain('    Cause:\n    Error: Top failure');
  });
});

describe('getTaxReportYear', () => {
  it('uses the previous year before or on April 30', () => {
    expect(getTaxReportYear(new Date(2024, 3, 30))).toBe(2023);
  });

  it('uses the current year after April 30', () => {
    expect(getTaxReportYear(new Date(2024, 4, 1))).toBe(2024);
  });
});
