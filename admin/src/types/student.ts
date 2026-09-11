export interface StudentRecord {
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CourseRecord {
  orderId: string;
  orderNumber: string;
  lineItemId: string;
  productId: string;
  productName: string;
  lineItemType: string;
  quantity: number;
  pricePaid: { currency: string; value: string };
  purchasedOn: string;
  semester: "Fall" | "Spring" | "Summer" | "Full Year";
  academicYear: string;
  gender: string | null;
  studentType: string | null;
  variantOptions: Record<string, string>;
  formResponses: Record<string, string>;
  syncedAt: unknown;
  /**
   * Materials pickup, per session (keyed by the session's semester — see
   * @/lib/courseSessions). Most courses only ever have one key, matching
   * `semester` above. A "Full Year" purchase in a split-session program
   * (Prophetic Guidance / Taqwa for Teens / Advanced Studies) gets separate
   * Fall/Spring materials handed out at different points in the year, so it
   * needs two independent pickup states on the *same* course doc — this is
   * why pickup isn't a flat boolean.
   *
   * Read via @/lib/courseSessions's getSessionPickup, never this field
   * directly, so the legacy fallback below is honored consistently.
   */
  materialsPickup?: Record<string, { pickedUp: boolean; pickedUpAt: unknown }>;
  /**
   * @deprecated Predates the per-session materialsPickup map above; no
   * longer written (every toggle, split-session course or not, writes
   * materialsPickup.<semester> instead). Left on old course docs so
   * getSessionPickup can still fall back to it — only for a course's first
   * session, so an old "picked up" flag can't silently mark a Full Year
   * course's Spring session done too.
   */
  materialsPickedUp?: boolean;
  materialsPickedUpAt?: unknown;
}
