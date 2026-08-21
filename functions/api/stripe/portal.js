import {
  errorResponse,
  jsonResponse,
  resolveSession,
} from "../../lib/auth.js";
import { getBillingUser } from "../../lib/billing.js";
import { createPortalSession, stripeConfigured } from "../../lib/stripe.js";
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
    return errorResponse("Log in to manage billing.", 401);
  }

  const billingUser = (await getBillingUser(context.env, user.id)) || user;
  if (!billingUser.stripe_customer_id) {
    return errorResponse("No billing profile found for this account.", 400);
  }

  try {
    const session = await createPortalSession(context.env, billingUser);
    if (!session.url) {
      return errorResponse("Could not open billing portal.", 502);
    }

    return jsonResponse({ url: session.url }, 200, sessionHeaders);
  } catch (error) {
    return errorResponse(error.message || "Could not open billing portal.", 502);
  }
}
