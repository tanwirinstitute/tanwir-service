const discountResult = {
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    code: { type: "string", example: "FAID-YP-75-26-2B3E" },
    discount: {
      type: "object",
      description: "The created Squarespace discount object, returned as-is.",
    },
  },
} as const;

const errorResult = {
  type: "object",
  properties: {
    success: { type: "boolean", example: false },
    message: { type: "string" },
    error: {},
  },
} as const;

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Tanwir API",
    version: "1.0.0",
    description: "Internal APIs for Tanwir Institute.",
  },
  servers: [
    { url: "https://api.tanwir.institute", description: "Production" },
    { url: "http://localhost:3005", description: "Local dev" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "SYNC_API_TOKEN shared secret (same value as admin/.env)",
      },
    },
    schemas: { discountResult, errorResult },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/api/health": {
      get: {
        summary: "Health check",
        security: [],
        responses: {
          "200": {
            description: "Service is up",
            content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", example: "ok" } } } } },
          },
        },
      },
    },
    "/api/discount-codes": {
      post: {
        summary: "Generate a discount code and create it as a live Squarespace promo code",
        description:
          "Generates a code in the form {TYPE}-{PROGRAM}-{PERCENT}-{YEAR}-{SUFFIX} (e.g. FAID-YP-75-26-2B3E) and creates a matching site-wide, percentage-off, one-use-per-customer discount via Squarespace's Commerce Discounts API.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["programCode", "discountPercentage"],
                properties: {
                  programCode: {
                    type: "string",
                    pattern: "^[A-Za-z0-9]{2,6}$",
                    description: "Caller-supplied program code, e.g. \"YP\". This service doesn't maintain a program list.",
                    example: "YP",
                  },
                  discountPercentage: { type: "integer", enum: [25, 50, 75, 100] },
                  type: {
                    type: "string",
                    pattern: "^[A-Za-z0-9]{2,6}$",
                    description: "Award-type prefix.",
                    default: "FAID",
                  },
                  name: {
                    type: "string",
                    description: "Display name shown in the Squarespace dashboard. Defaults to \"{type} {discountPercentage}% - {programCode}\".",
                  },
                  validDays: { type: "integer", minimum: 1, default: 14 },
                  maxUsesAllowed: { type: "integer", minimum: 1, description: "If set, caps total site-wide redemptions." },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Discount created", content: { "application/json": { schema: discountResult } } },
          "400": { description: "Missing or invalid fields", content: { "application/json": { schema: errorResult } } },
          "401": { description: "Missing/invalid bearer token", content: { "application/json": { schema: errorResult } } },
          "500": { description: "Squarespace API call failed", content: { "application/json": { schema: errorResult } } },
        },
      },
    },
  },
};
