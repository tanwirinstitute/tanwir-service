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
  /** Only set once an admin marks it from the dashboard; absent until then. */
  materialsPickedUp?: boolean;
  materialsPickedUpAt?: unknown;
}
