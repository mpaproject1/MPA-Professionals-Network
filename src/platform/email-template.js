const BRAND = {
  name: "Muslim Professionals Association",
  product: "MPA Professionals Network",
  url: "https://portal.muslimprofession.org",
  navy: "#0B1630",
  navySoft: "#142746",
  lime: "#C7F36B",
  ink: "#172033",
  muted: "#596579",
  paper: "#F4F7FB",
  border: "#E1E7EF"
};

export function escapeEmailHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractBody(html) {
  const source = String(html || "").trim();
  const body = source.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  if (body) return body[1];
  return source
    .replace(/<!doctype[^>]*>/ig, "")
    .replace(/<html\b[^>]*>/ig, "")
    .replace(/<\/html\s*>/ig, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/ig, "")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/ig, "")
    .trim();
}

function textAsHtml(text) {
  return String(text || "")
    .split(/\r?\n\s*\r?\n/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p style="margin:0 0 16px;line-height:1.65;color:${BRAND.ink};">${escapeEmailHtml(part).replace(/\r?\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Wrap every outgoing HTML email in a conservative, table-based layout that
 * survives common email clients. All styles are inline; no external CSS,
 * fonts, scripts, or remote images are required.
 */
export function renderBrandedEmail({ subject = "", htmlBody = "", textBody = "", preheader = "" } = {}) {
  const supplied = String(htmlBody || "").trim();
  const body = supplied ? extractBody(supplied) : textAsHtml(textBody);
  const safePreheader = escapeEmailHtml(preheader || subject || "An update from MPA Professionals Network");
  const year = new Date().getUTCFullYear();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeEmailHtml(subject || BRAND.product)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.paper};font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};">
  <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${safePreheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${BRAND.paper};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;">
        <tr><td style="background:${BRAND.navy};padding:26px 30px 22px;border-bottom:5px solid ${BRAND.lime};">
          <p style="margin:0 0 5px;color:${BRAND.lime};font-size:11px;line-height:1.4;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;">${BRAND.name}</p>
          <p style="margin:0;color:#ffffff;font-size:22px;line-height:1.35;font-weight:bold;">${BRAND.product}</p>
          <p style="margin:7px 0 0;color:#D8E2F1;font-size:13px;line-height:1.5;">Your professional community. Your next opportunity.</p>
        </td></tr>
        <tr><td style="padding:30px;font-size:15px;line-height:1.65;color:${BRAND.ink};">
          ${body || '<p style="margin:0;line-height:1.65;">There is an update for your MPA Professionals Network account. Sign in to review the latest details.</p>'}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-top:1px solid ${BRAND.border};"><tr><td style="padding-top:18px;">
            <p style="margin:0 0 8px;color:${BRAND.muted};font-size:12px;line-height:1.6;">This is an automated message from ${BRAND.product}. Replies to this address may not be monitored.</p>
            <p style="margin:0;font-size:12px;line-height:1.6;"><a href="${BRAND.url}" style="color:${BRAND.navySoft};font-weight:bold;text-decoration:underline;">Open MPA Professionals Network</a></p>
          </td></tr></table>
        </td></tr>
        <tr><td style="background:${BRAND.navy};padding:14px 30px;">
          <p style="margin:0;color:#D8E2F1;font-size:11px;line-height:1.5;">© ${year} ${BRAND.name}. Built on trust, service and professional growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Build the account-verification body through the same branded email shell as other messages. */
export function renderVerificationEmail({ subject = "", textBody = "", htmlTemplate = "", verificationUrl = "", registrationReference = "" } = {}) {
  const htmlBody = String(htmlTemplate || "").trim() || `<p style="margin:0 0 16px;">Verify your email address to activate your MPA Professionals Network account.</p><p style="margin:0 0 20px;">Registration reference: <strong>${escapeEmailHtml(registrationReference)}</strong></p><p style="margin:24px 0;"><a href="${escapeEmailHtml(verificationUrl)}" style="display:inline-block;background:#C7F36B;color:#0B1630;padding:13px 20px;border-radius:7px;font-weight:bold;text-decoration:none;">Verify email address</a></p><p style="margin:0;color:#596579;font-size:13px;">This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>`;
  return renderBrandedEmail({
    subject,
    textBody,
    preheader: "Confirm your email address to activate your MPA Professionals Network account.",
    htmlBody
  });
}
