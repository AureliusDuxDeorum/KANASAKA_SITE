-- KS Stocks subscription fields (populated by Stripe webhooks on kanasaka.com).
-- Safe to re-run: duplicate column errors mean the column already exists.

ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN ks_stocks_subscription_status TEXT;
ALTER TABLE users ADD COLUMN ks_stocks_subscription_ends_at TEXT;
