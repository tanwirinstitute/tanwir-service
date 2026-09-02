export interface BlastRecipient {
  email: string;
  name?: string;
}

export interface BlastRecipientResult {
  email: string;
  success: boolean;
  error?: string;
}

export interface SendBlastBatchResult {
  sent: number;
  failed: number;
  results: BlastRecipientResult[];
}

/**
 * Sends one batch (at most 25 — emailer's own cap) of individual,
 * personalized emails via emailer's POST /api/send-blast-email. Each
 * recipient gets their own Gmail send; subject/htmlContent may contain a
 * {{name}} token.
 */
export async function sendBlastBatch(params: {
  recipients: BlastRecipient[];
  subject: string;
  htmlContent: string;
}): Promise<SendBlastBatchResult> {
  const baseUrl = process.env.EMAIL_ORIGIN;
  const token = process.env.MAIL_API_TOKEN;

  if (!baseUrl || !token) {
    throw new Error("EMAIL_ORIGIN or MAIL_API_TOKEN is not set");
  }

  const endpoint = `${baseUrl.replace(/\/+$/, "").replace(/\/api$/, "")}/api/send-blast-email`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      recipients: params.recipients,
      subject: params.subject,
      htmlContent: params.htmlContent,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Mail API responded ${response.status}: ${text}`);
  }

  const data = (await response.json()) as SendBlastBatchResult;
  return data;
}
