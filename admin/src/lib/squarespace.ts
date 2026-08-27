import type { SquarespaceOrder, SquarespaceOrdersResponse } from "@/types/squarespace";

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
