const LOGO_URL =
  "https://images.squarespace-cdn.com/content/66a00d45db79b1271d17284d/f596f1b5-33ae-4fde-b6e1-3a6c9beb0deb/tanwir-horizontal.png";

/**
 * Wraps admin-authored rich-text HTML (from the Email Console composer) in
 * the same branded look used by emailer's other templated emails (logo
 * header, centered card, footer). Unlike those templates this one has no
 * fixed greeting/sign-off — the admin's own content is the entire message
 * body, since they're meant to fully control wording.
 */
export function wrapBrandedEmail(bodyHtml: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${LOGO_URL}" alt="Tanwir Institute Logo" style="max-width: 300px; height: auto;">
      </div>
      <div style="color: #1a1d23; font-size: 15px; line-height: 1.6;">
        ${bodyHtml}
      </div>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0 12px;">
      <p style="font-size: 12px; color: #6c757d; text-align: center; margin: 0;">
        Tanwir Institute · <a href="mailto:programs@tanwirinstitute.org" style="color: #6c757d;">programs@tanwirinstitute.org</a>
      </p>
    </div>
  `;
}
