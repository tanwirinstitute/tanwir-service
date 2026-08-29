import type {
  SquarespaceOrder,
  SquarespaceOrdersResponse,
  SquarespaceProfile,
  SquarespaceProfilesResponse,
} from "@/types/squarespace";

const SQUARESPACE_API_URL = process.env.SQUARESPACE_API_URL || "https://api.squarespace.com/1.0";

/**
 * Fetches every order modified in [modifiedAfter, modifiedBefore), following
 * pagination cursors. Squarespace ignores modifiedAfter/modifiedBefore once a
 * cursor is present (the cursor already encodes the original range), so only
 * the first request includes them.
 */
export async function fetchOrders(modifiedAfter: string, modifiedBefore: string): Promise<SquarespaceOrder[]> {
  const apiKey = process.env.SQUARESPACE_API_KEY;
  if (!apiKey) {
    throw new Error("SQUARESPACE_API_KEY is not set");
  }

  const orders: SquarespaceOrder[] = [];
  let url: string | null =
    `${SQUARESPACE_API_URL}/commerce/orders?modifiedAfter=${encodeURIComponent(modifiedAfter)}&modifiedBefore=${encodeURIComponent(modifiedBefore)}`;

  while (url) {
    const response: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Squarespace API responded ${response.status}: ${body}`);
    }

    const data: SquarespaceOrdersResponse = await response.json();
    orders.push(...(data.result ?? []));

    url = data.pagination?.hasNextPage ? data.pagination.nextPageUrl ?? null : null;
  }

  return orders;
}

/**
 * Looks up the Squarespace customer *account* for an email via the Profiles
 * API. Returns null when no profile matches (e.g. the email only ever appears
 * on guest-checkout orders). The API matches email case-insensitively but
 * exact-match on the local part, so pass the address as it appears on the
 * order. Requires the API key to carry the "Profiles" permission — a key
 * without it gets a 403 here, which we surface loudly rather than silently
 * falling back to billing names.
 */
export async function fetchProfileByEmail(email: string): Promise<SquarespaceProfile | null> {
  const apiKey = process.env.SQUARESPACE_API_KEY;
  if (!apiKey) {
    throw new Error("SQUARESPACE_API_KEY is not set");
  }

  const url = `${SQUARESPACE_API_URL}/profiles?filter=${encodeURIComponent(`email,${email}`)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Squarespace Profiles API responded ${response.status}: ${body}`);
  }

  const data: SquarespaceProfilesResponse = await response.json();
  const profiles = data.profiles ?? [];

  // The email filter can still return more than one profile (Squarespace has
  // historically allowed duplicate profiles for the same address). Prefer one
  // that actually has a login, then one with a usable name.
  return (
    profiles.find((p) => p.hasAccount && (p.firstName || p.lastName)) ??
    profiles.find((p) => p.firstName || p.lastName) ??
    profiles[0] ??
    null
  );
}
