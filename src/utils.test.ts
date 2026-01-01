import { formatErrorCause } from './utils';

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
