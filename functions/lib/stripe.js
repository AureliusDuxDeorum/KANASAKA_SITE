import { allowedSiteOrigin } from "./security.js";

const STRIPE_API = "https://api.stripe.com/v1";

export function stripeConfigured(env) {
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_PRICE_KS_PACKAGE_MONTHLY &&
      env.STRIPE_PRICE_KS_PACKAGE_ANNUAL
  );
}

export function stripePriceIdForPlan(env, plan) {
  if (plan === "monthly") {
    return env.STRIPE_PRICE_KS_PACKAGE_MONTHLY;
  }
  if (plan === "annual") {
    return env.STRIPE_PRICE_KS_PACKAGE_ANNUAL;
  }
  return null;
}

function encodeStripeParams(input, prefix) {
  const parts = [];

  function walk(value, keyPrefix) {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(function (item, index) {
        walk(item, keyPrefix + "[" + index + "]");
      });
      return;
    }

    if (typeof value === "object") {
      Object.keys(value).forEach(function (key) {
        walk(value[key], keyPrefix + "[" + key + "]");
      });
      return;
    }

    parts.push(
      encodeURIComponent(keyPrefix) + "=" + encodeURIComponent(String(value))
    );
  }

  Object.keys(input).forEach(function (key) {
    walk(input[key], prefix ? prefix + "[" + key + "]" : key);
  });

  return parts.join("&");
}

export async function stripeRequest(env, method, path, params) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured.");
  }

  const response = await fetch(STRIPE_API + path, {
    method,
    headers: {
      Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params && method !== "GET" ? encodeStripeParams(params) : undefined,
  });

  const data = await response.json().catch(function () {
    return {};
  });

  if (!response.ok) {
    const message =
      (data && data.error && data.error.message) || "Stripe request failed.";
    throw new Error(message);
  }

  return data;
}

function billingReturnUrl(env, query) {
  const site = allowedSiteOrigin(env);
  const params = new URLSearchParams(query || "");
  params.set("section", "billing");
  const qs = params.toString();
  return site + "/account/settings/?" + qs;
}

export async function createCheckoutSession(env, { user, plan }) {
  const priceId = stripePriceIdForPlan(env, plan);
  if (!priceId) {
    throw new Error("Unknown subscription plan.");
  }

  const params = {
    mode: "subscription",
    success_url: billingReturnUrl(env, "billing=success"),
    cancel_url: billingReturnUrl(env, "billing=cancel"),
    client_reference_id: String(user.id),
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
    "subscription_data[metadata][user_id]": String(user.id),
    "metadata[user_id]": String(user.id),
    allow_promotion_codes: "true",
  };

  if (user.stripe_customer_id) {
    params.customer = user.stripe_customer_id;
  } else {
    params.customer_email = user.email;
  }

  return stripeRequest(env, "POST", "/checkout/sessions", params);
}

export async function createPortalSession(env, user) {
  if (!user.stripe_customer_id) {
    throw new Error("No billing profile found for this account.");
  }

  return stripeRequest(env, "POST", "/billing_portal/sessions", {
    customer: user.stripe_customer_id,
    return_url: billingReturnUrl(env),
  });
}

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)]
    .map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    })
    .join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}

export async function verifyStripeWebhook(request, env, rawBody) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  const header = request.headers.get("stripe-signature");

  if (!secret || !header) {
    return null;
  }

  const entries = header.split(",").map(function (part) {
    const index = part.indexOf("=");
    return [part.slice(0, index), part.slice(index + 1)];
  });

  const timestamp = entries.find(function (entry) {
    return entry[0] === "t";
  });
  const signature = entries.find(function (entry) {
    return entry[0] === "v1";
  });

  if (!timestamp || !signature) {
    return null;
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp[1]));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    return null;
  }

  const payload = timestamp[1] + "." + rawBody;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  const expected = hexFromBuffer(digest);

  if (!timingSafeEqual(expected, signature[1])) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

export function subscriptionPeriodEndIso(subscription) {
  if (!subscription || subscription.current_period_end == null) {
    return null;
  }

  return new Date(Number(subscription.current_period_end) * 1000).toISOString();
}
