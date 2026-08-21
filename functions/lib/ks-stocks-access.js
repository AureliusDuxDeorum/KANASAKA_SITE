/**
 * KS Stocks desktop entitlement (KANASAKA session contract).
 *
 * Website integration (Stripe, later):
 * - Run migrations/014_ks_stocks_subscription.sql
 * - Stripe Checkout sets stripe_customer_id on users
 * - Webhooks update ks_stocks_subscription_status (+ optional ends_at)
 * - sessionPayload() exposes ksStocksEntitled to the desktop app via /api/auth/session
 *
 * Rules:
 * - account_id "ks_dev" → permanent access (no subscription)
 * - everyone else → ksStocksEntitled when subscription status is active or trialing
 */

export const KS_STOCKS_DEV_ACCOUNT_ID = "ks_dev";
export const KS_STOCKS_SUBSCRIBE_URL = "https://kanasaka.com/products/ks-stocks/";

const ACTIVE_SUBSCRIPTION_STATUSES = {
  active: true,
  trialing: true,
};

export function normalizeAccountId(value) {
  return String(value || "").trim().toLowerCase();
}

export function isKsStocksDeveloperAccount(accountId) {
  return normalizeAccountId(accountId) === KS_STOCKS_DEV_ACCOUNT_ID;
}

export function ksStocksEntitlementFromUser(user) {
  const accountId = user && user.account_id ? String(user.account_id) : null;

  if (isKsStocksDeveloperAccount(accountId)) {
    return {
      ksStocksEntitled: true,
      subscriptionStatus: "developer",
      ksStocksAccessReason: "developer",
      subscriptionEndsAt: null,
    };
  }

  const status =
    user && user.ks_stocks_subscription_status
      ? String(user.ks_stocks_subscription_status).trim().toLowerCase()
      : null;

  const entitled = Boolean(status && ACTIVE_SUBSCRIPTION_STATUSES[status]);
  const endsAt =
    user && user.ks_stocks_subscription_ends_at
      ? String(user.ks_stocks_subscription_ends_at)
      : null;

  return {
    ksStocksEntitled: entitled,
    subscriptionStatus: status,
    ksStocksAccessReason: entitled ? "subscription" : "none",
    subscriptionEndsAt: endsAt,
  };
}
