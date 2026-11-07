/**
 * KS Stocks desktop entitlement (KANASAKA session contract), read-only.
 *
 * The site no longer sells or manages anything: there is no checkout, billing
 * portal or payment webhook. Accounts that already hold KS Stocks access keep it,
 * so the desktop app keeps working for them; the flag is simply read from what is
 * already stored on the account and never changes by itself.
 *
 * Rules:
 * - account_id "dev_ks" -> permanent developer admin
 * - everyone else -> ksStocksEntitled when the stored status is active or trialing
 *   (migrations/014_ks_stocks_subscription.sql)
 */

export const KS_STOCKS_DEV_ACCOUNT_ID = "dev_ks";

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
