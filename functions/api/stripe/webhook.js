import { jsonResponse } from "../../lib/auth.js";
import {
  applyCheckoutSession,
  applyStripeSubscription,
} from "../../lib/billing.js";
import { verifyStripeWebhook } from "../../lib/stripe.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return jsonResponse({ error: "Webhook not configured." }, 503);
  }

  const rawBody = await request.text();
  const event = await verifyStripeWebhook(request, env, rawBody);

  if (!event) {
    return jsonResponse({ error: "Invalid webhook signature." }, 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await applyCheckoutSession(env, event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applyStripeSubscription(env, event.data.object);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return jsonResponse({ error: "Webhook handler failed." }, 500);
  }

  return jsonResponse({ received: true });
}
