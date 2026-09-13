export function siteUrl(env) {
  return (env.SITE_URL || "https://kanasaka.com").replace(/\/$/, "");
}

export function fromAddress(env) {
  const email = env.FROM_EMAIL || "noreply@kanasaka.com";
  const name = env.FROM_NAME || "KANASAKA";
  return `${name} <${email}>`;
}

export function fromEmail(env) {
  return env.FROM_EMAIL || "noreply@kanasaka.com";
}

function plainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseResendError(body) {
  if (!body) {
    return "Resend rejected the request.";
  }

  try {
    const data = JSON.parse(body);
    if (data && data.message) {
      return String(data.message);
    }
  } catch {
    // fall through
  }

  return body.slice(0, 180);
}

export async function sendEmail(env, { to, subject, html }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason:
        "RESEND_API_KEY is missing in Cloudflare Pages → Settings → Variables and secrets → Production.",
    };
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
    return {
      ok: false,
      reason: "Could not reach Resend. Try again in a moment.",
    };
  }

  if (!response.ok) {
    const body = await response.text();
    console.error("Email send failed:", response.status, body);

    if (response.status === 401) {
      return {
        ok: false,
        reason:
          "RESEND_API_KEY is invalid. Create a new key in Resend and update the Production secret in Cloudflare.",
      };
    }

    if (response.status === 403) {
      return {
        ok: false,
        reason:
          "Resend rejected the API key. Check that the key has send permission and belongs to the correct account.",
      };
    }

    const detail = parseResendError(body);
    if (
      detail.includes("domain") ||
      detail.includes("verify") ||
      detail.includes("not verified")
    ) {
      return {
        ok: false,
        reason:
          "Domain not verified in Resend. Add kanasaka.com in Resend → Domains and complete the DNS records in Cloudflare.",
      };
    }

    return {
      ok: false,
      reason: detail,
    };
  }

  return { ok: true };
}

export async function getEmailStatus(env) {
  const apiKey = env.RESEND_API_KEY;
  const status = {
    resendConfigured: Boolean(apiKey),
    fromEmail: fromEmail(env),
    fromAddress: fromAddress(env),
    domainVerified: null,
    domainStatus: null,
    resendError: null,
  };

  if (!apiKey) {
    status.resendError =
      "RESEND_API_KEY is missing in Cloudflare Pages Production secrets.";
    return status;
  }

  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      status.resendError = parseResendError(body);
      if (response.status === 401) {
        status.resendError =
          "RESEND_API_KEY is invalid. Replace the Production secret in Cloudflare.";
      }
      return status;
    }

    const data = await response.json();
    const domains = data && data.data ? data.data : [];
    const domain = domains.find(function (item) {
      return item.name === "kanasaka.com";
    });

    if (!domain) {
      status.domainVerified = false;
      status.domainStatus = "missing";
      status.resendError =
        "kanasaka.com is not added in Resend → Domains yet.";
      return status;
    }

    status.domainStatus = domain.status;
    status.domainVerified = domain.status === "verified";
    if (!status.domainVerified) {
      status.resendError =
        "kanasaka.com is in Resend but not verified yet. Finish the DNS records in Cloudflare.";
    }
  } catch (err) {
    status.resendError = "Could not check Resend domain status.";
  }

  return status;
}

export async function sendVerificationCodeEmail(env, email, code) {
  const html = `
    <p>Welcome to KANASAKA.</p>
    <p>Your verification code is:</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:0.35em;margin:16px 0;">${code}</p>
    <p>Enter this code on the verification page to activate your account. It expires in 15 minutes.</p>
    <p>If you did not create an account, you can ignore this email.</p>
  `;

  return sendEmail(env, {
    to: email,
    subject: "Your KANASAKA verification code",
    html,
  });
}

export async function sendPasswordResetCodeEmail(env, email, code) {
  const html = `
    <p>We received a request to reset your KANASAKA account password.</p>
    <p>Your password reset code is:</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:0.35em;margin:16px 0;">${code}</p>
    <p>Enter this code on the reset password page. It expires in 15 minutes.</p>
    <p>If you did not request a reset, you can ignore this email.</p>
  `;

  return sendEmail(env, {
    to: email,
    subject: "Your KANASAKA password reset code",
    html,
  });
}

export async function sendLoginNotificationEmail(env, email, { success, reason, location }) {
  const when = new Date().toUTCString();
  const html = `
    <p>${success ? "A sign-in to your KANASAKA account just succeeded." : "A sign-in attempt on your KANASAKA account was blocked."}</p>
    <p><strong>Result:</strong> ${reason}</p>
    <p><strong>Approximate location:</strong> ${location || "unknown"}</p>
    <p><strong>Time:</strong> ${when}</p>
    <p>If this wasn't you, change your password right away and consider enabling two-factor authentication in Account Settings.</p>
  `;

  return sendEmail(env, {
    to: email,
    subject: success ? "New sign-in to your KANASAKA account" : "Sign-in attempt on your KANASAKA account",
    html,
  });
}

const TWO_FACTOR_EMAIL_COPY = {
  setup: {
    subject: "Enable two-factor authentication",
    intro: "Use this code to turn on two-factor authentication for your KANASAKA account:",
  },
  disable: {
    subject: "Disable two-factor authentication",
    intro: "Use this code to turn off two-factor authentication for your KANASAKA account:",
  },
  login: {
    subject: "Your KANASAKA sign-in code",
    intro: "Use this code to finish signing in to your KANASAKA account:",
  },
};

export async function sendTwoFactorCodeEmail(env, email, code, context) {
  const copy = TWO_FACTOR_EMAIL_COPY[context] || {
    subject: "Your KANASAKA verification code",
    intro: "Your verification code is:",
  };

  const html = `
    <p>${copy.intro}</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:0.35em;margin:16px 0;">${code}</p>
    <p>This code expires in 5 minutes.</p>
    <p>If you did not request this, you can ignore this email and your account will remain unchanged.</p>
  `;

  return sendEmail(env, {
    to: email,
    subject: copy.subject,
    html,
  });
}

export async function sendTermsEmail(env, email) {
  const { getTermsEmailHtml } = await import("./terms.js");

  return sendEmail(env, {
    to: email,
    subject: "KANASAKA Terms of Service",
    html: getTermsEmailHtml(),
  });
}
