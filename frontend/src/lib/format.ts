/**
 * Money arrives from the API as integer paise and is only ever turned into
 * rupees for display — never for arithmetic. All the maths happens server-side
 * in integers.
 */
export function formatPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function formatCredits(credits: number): string {
  return new Intl.NumberFormat('en-IN').format(credits);
}

/** Signed, so the ledger shows direction at a glance. */
export function formatSignedCredits(amount: number): string {
  const formatted = formatCredits(Math.abs(amount));
  return amount < 0 ? `−${formatted}` : `+${formatted}`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
