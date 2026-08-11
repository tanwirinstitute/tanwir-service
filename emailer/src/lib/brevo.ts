interface BrevoRecipient {
  email: string;
  name?: string;
}

interface SendBrevoEmailParams {
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  senderName?: string;
  senderEmail?: string;
}

export class BrevoError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`Brevo API responded ${status}`);
    this.name = "BrevoError";
    this.status = status;
    this.body = body;
  }
}

export async function sendBrevoEmail(params: SendBrevoEmailParams): Promise<unknown> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not set");
  }

  const payload = {
    sender: {
      name: params.senderName || process.env.SENDER_NAME || "Tanwir Institute",
      email: params.senderEmail || process.env.SENDER_EMAIL || "noreply@tanwirinstitute.org",
    },
    to: params.to,
    subject: params.subject,
    htmlContent: params.htmlContent,
  };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new BrevoError(response.status, data);
  }

  return data;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
