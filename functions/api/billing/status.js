import {
  errorResponse,
  jsonResponse,
  resolveSession,
} from "../../lib/auth.js";
import { getBillingUser } from "../../lib/billing.js";
import {
  KS_STOCKS_DEV_ACCOUNT_ID,
  ksStocksEntitlementFromUser,
} from "../../lib/ks-stocks-access.js";
import { stripeConfigured } from "../../lib/stripe.js";

export async function onRequestGet(context) {
  const { user, sessionHeaders } = await resolveSession(
    context.request,
    context.env
  );

  if (!user) {
    return errorResponse("Log in to view billing.", 401);
  }

  const billingUser = (await getBillingUser(context.env, user.id)) || user;
  const entitlement = ksStocksEntitlementFromUser(billingUser);

  return jsonResponse(
    {
      configured: stripeConfigured(context.env),
      productName: "KS_Package",
      monthlyPrice: "€10",
      annualPrice: "€100",
      developerAccountId: KS_STOCKS_DEV_ACCOUNT_ID,
      ...entitlement,
      stripeCustomerId: billingUser.stripe_customer_id || null,
    },
    200,
    sessionHeaders
  );
}
