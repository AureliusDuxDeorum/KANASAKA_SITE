export function siteUrl(env) {
  return (env.SITE_URL || "https://kanasaka.com").replace(/\/$/, "");
}

export function fromAddress(env) {
  const email = env.FROM_EMAIL || "noreply@kanasaka.com";
  const name = env.FROM_NAME || "KANASAKA";
  return `${name} <${email}>`;
}

function plainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendEmail(env, { to, subject, html }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not configured.");
    return false;
  }

  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(env),
        to: [to],
        subject,
        html,
        text: plainText(html),
      }),
    });
  } catch (err) {
    console.error("Email send request failed:", err);
    return false;
  }

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch (err) {
      console.error("Email send response read failed:", err);
    }
    console.error("Email send failed:", response.status, body);
    return false;
  }

  return true;
}

export async function sendVerificationEmail(env, email, token) {
  const url = `${siteUrl(env)}/verify/?token=${encodeURIComponent(token)}`;
  const html = `
    <p>Welcome to KANASAKA.</p>
    <p>Confirm your email address to activate your account:</p>
    <p><a href="${url}">${url}</a></p>
    <p>This link expires in 24 hours.</p>
    <p>If you did not create an account, you can ignore this email.</p>
  `;

  return sendEmail(env, {
    to: email,
    subject: "Confirm your KANASAKA account",
    html,
  });
}

export async function sendPasswordResetEmail(env, email, token) {
  const url = `${siteUrl(env)}/reset-password/?token=${encodeURIComponent(token)}`;
  const html = `
    <p>We received a request to reset your KANASAKA account password.</p>
    <p><a href="${url}">${url}</a></p>
    <p>This link expires in 1 hour.</p>
    <p>If you did not request a reset, you can ignore this email.</p>
  `;

  return sendEmail(env, {
    to: email,
    subject: "Reset your KANASAKA password",
    html,
  });
}
