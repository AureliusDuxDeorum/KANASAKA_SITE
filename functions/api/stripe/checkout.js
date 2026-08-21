import {
  errorResponse,
  jsonResponse,
  readJson,
  resolveSession,
} from "../../lib/auth.js";
import { getBillingUser } from "../../lib/billing.js";
import {
  isKsStocksDeveloperAccount,
  ksStocksEntitlementFromUser,
} from "../../lib/ks-stocks-access.js";
import {
  createCheckoutSession,
  stripeConfigured,
  stripePriceIdForPlan,
} from "../../lib/stripe.js";
import { requireSameOrigin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const originError = requireSameOrigin(context.request, context.env);
  if (originError) {
    return originError;
  }

  if (!stripeConfigured(context.env)) {
    return errorResponse("Billing is not configured yet.", 503);
  }

  const { user, sessionHeaders } = await resolveSession(
    context.request,
    context.env
  );
  if (!user) {
    return errorResponse("Log in to subscribe.", 401);
  }

  if (isKsStocksDeveloperAccount(user.account_id)) {
    return errorResponse("Developer accounts already include full access.", 400);
  }

  const body = await readJson(context.request);
  const plan = body && body.plan ? String(body.plan).trim().toLowerCase() : "";
  if (!stripePriceIdForPlan(context.env, plan)) {
    return errorResponse("Choose monthly or annual billing.");
  }

  const billingUser = (await getBillingUser(context.env, user.id)) || user;
  const entitlement = ksStocksEntitlementFromUser(billingUser);
  if (entitlement.ksStocksEntitled && entitlement.ksStocksAccessReason === "subscription") {
    return errorResponse("You already have an active KS Package subscription.", 400);
  }

  try {
    const session = await createCheckoutSession(context.env, {
      user: billingUser,
      plan,
    });

    if (!session.url) {
      return errorResponse("Could not start checkout.", 502);
    }

    return jsonResponse({ url: session.url }, 200, sessionHeaders);
  } catch (error) {
    return errorResponse(error.message || "Could not start checkout.", 502);
  }
}
