function twilioConfigured(env) {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
}

function basicAuth(accountSid, authToken) {
  return btoa(accountSid + ":" + authToken);
}

export async function sendVerificationSms(env, phoneE164, code) {
  if (!twilioConfigured(env)) {
    throw new Error(
      "SMS is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in Cloudflare Pages secrets."
    );
  }

  const accountSid = env.TWILIO_ACCOUNT_SID;
  const url =
    "https://api.twilio.com/2010-04-01/Accounts/" +
    encodeURIComponent(accountSid) +
    "/Messages.json";

  const body = new URLSearchParams({
    To: phoneE164,
    From: env.TWILIO_FROM_NUMBER,
    Body: "Your KANASAKA verification code is " + code + ". It expires in 5 minutes.",
  });

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + basicAuth(accountSid, env.TWILIO_AUTH_TOKEN),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch {
    throw new Error("Could not reach Twilio. Try again in a moment.");
  }

  if (!response.ok) {
    let detail = "Twilio rejected the SMS request.";
    try {
      const data = await response.json();
      if (data && data.message) {
        detail = data.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }
}

export function smsConfigured(env) {
  return twilioConfigured(env);
}
