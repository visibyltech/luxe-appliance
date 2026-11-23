export function formatNgn(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `₦${safe.toLocaleString('en-NG')}`;
}

export function discountedPrice(priceNgn: number, discountPercent?: number): number {
  const pct = Math.min(Math.max(Number(discountPercent || 0), 0), 90);
  if (pct <= 0) return Math.round(priceNgn);
  return Math.round(priceNgn * (1 - pct / 100));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function sanitizeId(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || `id_${Date.now()}`;
}

export function formatTimestamp(ts: unknown): string {
  if (!ts) return 'Just now';
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? ts : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  return 'Just now';
}
