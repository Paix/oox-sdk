/**
 * Conversioni tra importi leggibili ("1.5") e unità atomiche (1500000000000000000n).
 * Lavorano su stringhe e bigint: nessun float, quindi nessun errore di arrotondamento.
 */

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

/** "1.5" con 18 decimali → 1500000000000000000n. Rifiuta più decimali di quelli del token. */
export function parseAmount(value: string | number, decimals: number): bigint {
  const text = typeof value === 'number' ? numberToPlainString(value) : value.trim();
  if (!DECIMAL_PATTERN.test(text)) {
    throw new Error(`Invalid amount: ${value}`);
  }

  const [integer, fraction = ''] = text.split('.');
  if (fraction.length > decimals) {
    throw new Error(`Amount ${value} has more than ${decimals} decimals`);
  }

  return BigInt(integer + fraction.padEnd(decimals, '0'));
}

/** 1500000000000000000n con 18 decimali → "1.5" */
export function formatAmount(value: bigint | string, decimals: number): string {
  const atomic = BigInt(value);
  const negative = atomic < 0n;
  const digits = (negative ? -atomic : atomic).toString().padStart(decimals + 1, '0');

  const integer = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');

  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

/** Deadline in unix seconds a `days` giorni da adesso */
export function deadlineFromDays(days: number, now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000) + Math.round(days * 24 * 60 * 60);
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid amount: ${value}`);
  }
  // String() dà la rappresentazione più corta (0.3 → "0.3", mentre toFixed(20) darebbe
  // 0.29999…); solo per la notazione esponenziale (1e-7) si espande in decimale
  const text = String(value);
  if (!text.includes('e')) {
    return text;
  }
  return value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
}
