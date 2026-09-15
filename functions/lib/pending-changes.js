import { generateRawToken, hashSecret } from "./tokens.js";

// Vault-style time-locked role changes (Coinbase Vault / Kraken Global
// Settings Lock): a role change doesn't take effect immediately. It's
// scheduled ROLE_CHANGE_DELAY_MINUTES out, both the target account and the
// admin who requested it get a cancel link, and the change only actually
// applies once something touches that account after the delay has passed
// (applyDuePendingRoleChanges below) -- there's no Cron infrastructure here,
// so "due" changes are applied lazily on the next relevant request rather
// than at the exact instant, which is an acceptable trade for the security
// property this buys (a real window to notice and cancel an unauthorized
// change before it takes effect).
export const ROLE_CHANGE_DELAY_MINUTES = 30;

// True once migrations/016_admin_hardening.sql has been run. Every function
// below fails soft to the pre-hardening behavior (immediate apply, no pending
// row) if the table doesn't exist yet, matching this repo's established
// schema-detection pattern (see schema.js) rather than breaking role changes
// outright until the migration is applied.
async function pendingTableExists(env) {
  try {
    await env.DB.prepare("SELECT id FROM pending_role_changes LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}

export async function schedulePendingRoleChange(env, { userId, previousRole, newRole, requestedBy }) {
  if (!(await pendingTableExists(env))) {
    return null;
  }

  const rawToken = generateRawToken(32);
  const tokenHash = await hashSecret("pending-role:" + rawToken, env);
  const effectiveAt = new Date(Date.now() + ROLE_CHANGE_DELAY_MINUTES * 60 * 1000).toISOString();

  await env.DB.prepare("DELETE FROM pending_role_changes WHERE user_id = ?").bind(userId).run();

  await env.DB.prepare(
    `INSERT INTO pending_role_changes
       (user_id, previous_role, new_role, requested_by, cancel_token_hash, effective_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(userId, previousRole, newRole, requestedBy, tokenHash, effectiveAt)
    .run();

  return { cancelToken: rawToken, effectiveAt };
}

export async function cancelPendingRoleChange(env, rawToken) {
  if (!(await pendingTableExists(env))) {
    return null;
  }

  const tokenHash = await hashSecret("pending-role:" + rawToken, env);
  const row = await env.DB.prepare(
    "SELECT id, user_id, previous_role, new_role FROM pending_role_changes WHERE cancel_token_hash = ?"
  )
    .bind(tokenHash)
    .first();

  if (!row) {
    return null;
  }

  await env.DB.prepare("DELETE FROM pending_role_changes WHERE id = ?").bind(row.id).run();
  return row;
}

// Applies (and clears) any pending change for this user whose delay has
// elapsed. Called opportunistically wherever the account is next touched
// (resolveSession for the account's own requests, admin lookup for the
// admin's oversight) rather than on a timer.
export async function applyDuePendingRoleChanges(env, userId) {
  if (!(await pendingTableExists(env))) {
    return null;
  }

  const row = await env.DB.prepare(
    `SELECT id, new_role FROM pending_role_changes
     WHERE user_id = ? AND effective_at <= datetime('now')`
  )
    .bind(userId)
    .first();

  if (!row) {
    return null;
  }

  await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(row.new_role, userId).run();
  await env.DB.prepare("DELETE FROM pending_role_changes WHERE id = ?").bind(row.id).run();

  return { userId, role: row.new_role };
}

export async function getPendingRoleChange(env, userId) {
  if (!(await pendingTableExists(env))) {
    return null;
  }

  return env.DB.prepare(
    "SELECT new_role, previous_role, requested_by, effective_at FROM pending_role_changes WHERE user_id = ?"
  )
    .bind(userId)
    .first();
}
