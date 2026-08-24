const recipient = {
  type: "object",
  required: ["email"],
  properties: {
    email: { type: "string", format: "email" },
    name: { type: "string" },
  },
} as const;

const sendResult = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    message: { type: "string" },
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
    title: "Tanwir Emailer API",
    version: "2.0.0",
    description: "Transactional email service for Tanwir Institute (Gmail-backed).",
  },
  servers: [
    { url: "https://email.tanwir.institute", description: "Production" },
    { url: "http://localhost:3002", description: "Local dev" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "MAIL_API_TOKEN shared secret",
      },
    },
    schemas: { recipient, sendResult, errorResult },
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
    "/api/send-zakat-consent-email": {
      post: {
        summary: "Send the Zakat funding consent email",
        description: "Used by the consent app to ask an applicant to consent to Zakat funding.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["recipientEmail", "studentName", "programName", "consentLink"],
                properties: {
                  recipientEmail: { type: "string", format: "email" },
                  studentName: { type: "string" },
                  programName: { type: "string" },
                  consentLink: { type: "string", format: "uri" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Sent", content: { "application/json": { schema: sendResult } } },
          "400": { description: "Missing or invalid fields", content: { "application/json": { schema: errorResult } } },
          "401": { description: "Missing/invalid bearer token", content: { "application/json": { schema: errorResult } } },
          "500": { description: "Gmail send failed", content: { "application/json": { schema: errorResult } } },
        },
      },
    },
    "/api/send-financial-aid-email": {
      post: {
        summary: "Send the financial aid approval + discount code email",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["recipientEmail", "studentName", "discountPercentage", "discountCode", "programName"],
                properties: {
                  recipientEmail: { type: "string", format: "email" },
                  studentName: { type: "string" },
                  discountPercentage: { oneOf: [{ type: "integer" }, { type: "string" }], enum: [25, 50, 75, 100] },
                  discountCode: { type: "string" },
                  programName: { type: "string" },
                  additionalDetails: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Sent", content: { "application/json": { schema: sendResult } } },
          "400": { description: "Missing or invalid fields", content: { "application/json": { schema: errorResult } } },
          "401": { description: "Missing/invalid bearer token", content: { "application/json": { schema: errorResult } } },
          "500": { description: "Gmail send failed", content: { "application/json": { schema: errorResult } } },
        },
      },
    },
    "/api/send-custom-email": {
      post: {
        summary: "Send an arbitrary HTML email to one or more recipients",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["recipients", "subject", "htmlContent"],
                properties: {
                  recipients: { type: "array", items: recipient, minItems: 1 },
                  subject: { type: "string" },
                  htmlContent: { type: "string" },
                  senderName: { type: "string" },
                  senderEmail: { type: "string", format: "email" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Sent to all recipients", content: { "application/json": { schema: sendResult } } },
          "207": { description: "Some recipients failed", content: { "application/json": { schema: sendResult } } },
          "400": { description: "Missing or invalid fields", content: { "application/json": { schema: errorResult } } },
          "401": { description: "Missing/invalid bearer token", content: { "application/json": { schema: errorResult } } },
        },
      },
    },
    "/api/send-prophetic-guidance-welcome": {
      post: {
        summary: "Send the Prophetic Guidance program welcome letter",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["recipients"],
                properties: {
                  recipients: { type: "array", items: recipient, minItems: 1 },
                  classDate: { type: "string" },
                  year1Year2Time: { type: "string" },
                  graduatesJourneyTime: { type: "string" },
                  senderName: { type: "string" },
                  senderEmail: { type: "string", format: "email" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Sent to all recipients", content: { "application/json": { schema: sendResult } } },
          "207": { description: "Some recipients failed", content: { "application/json": { schema: sendResult } } },
          "400": { description: "Missing or invalid fields", content: { "application/json": { schema: errorResult } } },
          "401": { description: "Missing/invalid bearer token", content: { "application/json": { schema: errorResult } } },
        },
      },
    },
    "/api/send-associates-program-welcome": {
      post: {
        summary: "Send the Associates Program welcome letter",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["recipients"],
                properties: {
                  recipients: { type: "array", items: recipient, minItems: 1 },
                  senderName: { type: "string" },
                  senderEmail: { type: "string", format: "email" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Sent to all recipients", content: { "application/json": { schema: sendResult } } },
          "207": { description: "Some recipients failed", content: { "application/json": { schema: sendResult } } },
          "400": { description: "Missing or invalid fields", content: { "application/json": { schema: errorResult } } },
          "401": { description: "Missing/invalid bearer token", content: { "application/json": { schema: errorResult } } },
        },
      },
    },
  },
};
