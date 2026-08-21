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
