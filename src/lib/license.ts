/**
 * One-time licence check against Lemon Squeezy's public validation endpoint. It needs no secret, which is why it is
 * safe to call from a static page. The key is a convenience for the buyer; the real protection is that the batch
 * tool is cheap and the price is low.
 */

export interface LicenseCheck {
  valid: boolean;
  /** Human-readable reason when not valid. */
  reason?: string;
}

const ENDPOINT = 'https://api.lemonsqueezy.com/v1/licenses/validate';

export function normalizeKey(input: string): string {
  return input.trim().replace(/\s+/g, '').toUpperCase();
}

/** Lemon Squeezy keys look like 8-4-4-4-12 hex groups. Used only to avoid pointless network calls. */
export function looksLikeKey(key: string): boolean {
  return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(key);
}

export async function validateLicense(
  key: string,
  productId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LicenseCheck> {
  const normalized = normalizeKey(key);
  if (!looksLikeKey(normalized)) return { valid: false, reason: 'That does not look like a licence key. Keys have five groups of letters and numbers separated by dashes.' };
  let res: Response;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ license_key: normalized }).toString(),
    });
  } catch {
    return { valid: false, reason: 'The licence server could not be reached. Check your connection and try again.' };
  }
  let data: { valid?: boolean; error?: string | null; meta?: { product_id?: number | string; status?: string } };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { valid: false, reason: 'The licence server gave an unexpected answer. Try again in a moment.' };
  }
  if (!data.valid) return { valid: false, reason: data.error || 'This key is not valid.' };
  if (String(data.meta?.product_id ?? '') !== String(productId)) {
    return { valid: false, reason: 'This key belongs to a different product.' };
  }
  return { valid: true };
}
