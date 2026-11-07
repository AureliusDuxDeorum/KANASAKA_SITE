// KS Stocks access is read-only now: the site sells nothing, but accounts that
// already hold access keep it, so the desktop app keeps working for them.
import assert from "node:assert/strict";
import { test } from "node:test";

import { sessionPayload } from "../functions/lib/auth.js";
import { ksStocksEntitlementFromUser } from "../functions/lib/ks-stocks-access.js";

test("accounts with a stored active or trialing status stay entitled", () => {
  assert.equal(ksStocksEntitlementFromUser({ account_id: "someone", ks_stocks_subscription_status: "active" }).ksStocksEntitled, true);
  assert.equal(ksStocksEntitlementFromUser({ account_id: "someone", ks_stocks_subscription_status: "Trialing " }).ksStocksEntitled, true);
});

test("everyone else is not entitled, and the developer account always is", () => {
  for (const status of [null, "", "canceled", "past_due", "unpaid"]) {
    assert.equal(ksStocksEntitlementFromUser({ account_id: "someone", ks_stocks_subscription_status: status }).ksStocksEntitled, false, String(status));
  }
  assert.equal(ksStocksEntitlementFromUser({ account_id: "DEV_KS" }).ksStocksEntitled, true);
});

test("the session payload keeps the flag the desktop app reads, and offers nothing to buy", () => {
  const payload = sessionPayload({ id: 1, email: "a@b.co", account_id: "someone", ks_stocks_subscription_status: "active" }, { SITE_URL: "https://kanasaka.com" });
  assert.equal(payload.ksStocksEntitled, true);
  assert.equal("subscriptionsOpen" in payload, false);
  assert.equal("subscriptionsPausedMessage" in payload, false);
});
