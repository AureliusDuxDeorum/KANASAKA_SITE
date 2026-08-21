import { usersHaveKsStocksSubscriptionColumns } from "./schema.js";
import { subscriptionPeriodEndIso, stripeRequest } from "./stripe.js";

export async function getBillingUser(env, userId) {
  const hasColumns = await usersHaveKsStocksSubscriptionColumns(env);
  if (!hasColumns) {
    return null;
  }

  return env.DB.prepare(
    `SELECT id, email, account_id, stripe_customer_id,
            ks_stocks_subscription_status, ks_stocks_subscription_ends_at
     FROM users
     WHERE id = ?`
  )
    .bind(userId)
    .first();
}

export async function getUserIdByStripeCustomerId(env, customerId) {
  if (!customerId) {
    return null;
  }

  const hasColumns = await usersHaveKsStocksSubscriptionColumns(env);
  if (!hasColumns) {
    return null;
  }

  const row = await env.DB.prepare(
    "SELECT id FROM users WHERE stripe_customer_id = ? LIMIT 1"
  )
    .bind(String(customerId))
    .first();

  return row ? row.id : null;
}

export async function updateUserSubscription(env, userId, fields) {
  const hasColumns = await usersHaveKsStocksSubscriptionColumns(env);
  if (!hasColumns || !userId) {
    return;
  }

  await env.DB.prepare(
    `UPDATE users
     SET stripe_customer_id = COALESCE(?, stripe_customer_id),
         ks_stocks_subscription_status = ?,
         ks_stocks_subscription_ends_at = ?
     WHERE id = ?`
  )
    .bind(
      fields.stripeCustomerId || null,
      fields.status || null,
      fields.endsAt || null,
      userId
    )
    .run();
}

export async function applyStripeSubscription(env, subscription, fallbackUserId) {
  if (!subscription) {
    return;
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer && subscription.customer.id
        ? subscription.customer.id
        : null;

  let userId =
    (subscription.metadata && subscription.metadata.user_id) ||
    fallbackUserId ||
    (await getUserIdByStripeCustomerId(env, customerId));

  if (!userId) {
    return;
  }

  await updateUserSubscription(env, userId, {
    stripeCustomerId: customerId,
    status: subscription.status || null,
    endsAt: subscriptionPeriodEndIso(subscription),
  });
}

export async function applyCheckoutSession(env, session) {
  if (!session) {
    return;
  }

  const userId =
    session.client_reference_id ||
    (session.metadata && session.metadata.user_id) ||
    null;

  if (!userId) {
    return;
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : null;

  if (customerId) {
    await env.DB.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?")
      .bind(customerId, userId)
      .run();
  }

  if (session.subscription) {
    const subscription = await stripeRequest(
      env,
      "GET",
      "/subscriptions/" + session.subscription,
      null
    );
    await applyStripeSubscription(env, subscription, userId);
  }
}
