import type {
  SquarespaceOrder,
  SquarespaceOrdersResponse,
  SquarespaceProduct,
  SquarespaceProductsResponse,
  SquarespaceProfile,
  SquarespaceProfilesResponse,
} from "@/types/squarespace";

const SQUARESPACE_API_URL = process.env.SQUARESPACE_API_URL || "https://api.squarespace.com/1.0";
// The Products API is only served under v2, unlike Orders/Profiles above.
const SQUARESPACE_PRODUCTS_API_URL = SQUARESPACE_API_URL.replace(/\/1\.0\/?$/, "/v2");
const PRODUCTS_PER_REQUEST = 50;

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

async function fetchProductsRequest(ids: string[], apiKey: string): Promise<SquarespaceProduct[] | null> {
  const url = `${SQUARESPACE_PRODUCTS_API_URL}/commerce/products/${ids.map(encodeURIComponent).join(",")}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Squarespace Products API responded ${response.status}: ${body}`);
  }

  const data: SquarespaceProductsResponse = await response.json();
  return data.products ?? [];
}

/**
 * Looks up products by id (up to 50 per request). Products that no longer
 * exist — e.g. last year's deleted "Annual Arafat Program" listing, still
 * referenced by old orders — are simply absent from the result. Squarespace
 * 404s a whole batch when any one id is missing, so a 404'd batch is retried
 * id-by-id to salvage the rest. Requires the API key to carry the "Products"
 * permission; a 403 is surfaced loudly, same as fetchProfileByEmail.
 */
export async function fetchProductsByIds(ids: string[]): Promise<SquarespaceProduct[]> {
  const apiKey = process.env.SQUARESPACE_API_KEY;
  if (!apiKey) {
    throw new Error("SQUARESPACE_API_KEY is not set");
  }

  const products: SquarespaceProduct[] = [];
  for (let i = 0; i < ids.length; i += PRODUCTS_PER_REQUEST) {
    const batch = ids.slice(i, i + PRODUCTS_PER_REQUEST);
    const result = await fetchProductsRequest(batch, apiKey);
    if (result) {
      products.push(...result);
      continue;
    }
    for (const id of batch) {
      products.push(...((await fetchProductsRequest([id], apiKey)) ?? []));
    }
  }

  return products;
}
