import { deadlineFromDays, formatAmount, parseAmount } from '../src';

describe('amounts', () => {
  it('parses human amounts without float errors', () => {
    expect(parseAmount('1.5', 18)).toBe(1_500_000_000_000_000_000n);
    expect(parseAmount('0.1', 18)).toBe(100_000_000_000_000_000n);
    expect(parseAmount('12', 6)).toBe(12_000_000n);
    expect(parseAmount(0.3, 18)).toBe(300_000_000_000_000_000n);
    // Un number porta con sé l'errore del float che contiene: per importi esatti si usano stringhe
    expect(parseAmount(0.1 + 0.2, 18)).toBe(300_000_000_000_000_040n);
    expect(parseAmount(1e-7, 18)).toBe(100_000_000_000n);
    expect(parseAmount('0.000001', 6)).toBe(1n);
  });

  it('rejects invalid amounts', () => {
    expect(() => parseAmount('1.0000001', 6)).toThrow('more than 6 decimals');
    expect(() => parseAmount('-1', 18)).toThrow('Invalid amount');
    expect(() => parseAmount('1e18', 18)).toThrow('Invalid amount');
    expect(() => parseAmount('abc', 18)).toThrow('Invalid amount');
  });

  it('formats atomic amounts', () => {
    expect(formatAmount(1_500_000_000_000_000_000n, 18)).toBe('1.5');
    expect(formatAmount('1000000', 6)).toBe('1');
    expect(formatAmount(1n, 6)).toBe('0.000001');
    expect(formatAmount(0n, 18)).toBe('0');
  });

  it('computes deadlines', () => {
    expect(deadlineFromDays(1, new Date(1_000_000_000_000))).toBe(1_000_000_000 + 86_400);
  });
});
