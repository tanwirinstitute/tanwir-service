interface SendConsentEmailParams {
  recipientEmail: string;
  studentName: string;
  programName: string;
  consentLink: string;
}

export async function sendZakatConsentEmail(params: SendConsentEmailParams): Promise<void> {
  const baseUrl = process.env.ZAKAT_MAIL_API_URL;
  const token = process.env.ZAKAT_MAIL_API_TOKEN;

  if (!baseUrl || !token) {
    throw new Error("ZAKAT_MAIL_API_URL or ZAKAT_MAIL_API_TOKEN is not set");
  }

  const response = await fetch(`${baseUrl}/send-zakat-consent-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      recipientEmail: params.recipientEmail,
      studentName: params.studentName,
      programName: params.programName,
      consentLink: params.consentLink,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Mail API responded ${response.status}: ${text}`);
  }
}
