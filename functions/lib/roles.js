import { isKsStocksDeveloperAccount } from "./ks-stocks-access.js";

export const ROLES = {
  user: "user",
  beta: "beta",
  admin: "admin",
};

const KNOWN_ROLES = new Set(Object.values(ROLES));

export function normalizeRole(value) {
  const role = String(value || ROLES.user)
    .trim()
    .toLowerCase();
  return KNOWN_ROLES.has(role) ? role : ROLES.user;
}

export function userHasRole(user, role) {
  if (!user) {
    return false;
  }
  return normalizeRole(user.role) === normalizeRole(role);
}

export function isAdmin(user) {
  return userHasRole(user, ROLES.admin);
}

// The dev_ks account is documented (ks-stocks-access.js) as "permanent
// developer admin ... all gated features" -- this extends that same
// account-based grant to the admin-panel/session-based admin checks,
// alongside the normal role==="admin" path.
export function isAdminUser(user) {
  return Boolean(user) && (isAdmin(user) || isKsStocksDeveloperAccount(user.account_id));
}
