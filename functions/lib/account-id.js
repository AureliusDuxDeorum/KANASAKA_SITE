export const ACCOUNT_ID_MIN = 3;
export const ACCOUNT_ID_MAX = 32;

const RESERVED_ACCOUNT_IDS = {
  admin: true,
  administrator: true,
  root: true,
  system: true,
  kanasaka: true,
  support: true,
  help: true,
  contact: true,
  noreply: true,
  mail: true,
  api: true,
  www: true,
  null: true,
  undefined: true,
};

export function normalizeAccountId(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function validateAccountId(value) {
  const accountId = normalizeAccountId(value);

  if (!accountId) {
    return { ok: false, error: "Enter an account ID." };
  }

  if (accountId.length < ACCOUNT_ID_MIN || accountId.length > ACCOUNT_ID_MAX) {
    return {
      ok: false,
      error:
        "Account ID must be between " +
        ACCOUNT_ID_MIN +
        " and " +
        ACCOUNT_ID_MAX +
        " characters.",
    };
  }

  if (!/^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/.test(accountId)) {
    return {
      ok: false,
      error:
        "Account ID must be 3–32 characters, use lowercase letters, numbers, underscores, or hyphens, and start/end with a letter or number.",
    };
  }

  if (RESERVED_ACCOUNT_IDS[accountId]) {
    return { ok: false, error: "That account ID is reserved." };
  }

  return { ok: true, value: accountId };
}

export async function isAccountIdAvailable(env, accountId, excludeUserId) {
  const validated = validateAccountId(accountId);
  if (!validated.ok) {
    return { available: false, error: validated.error };
  }

  let query =
    "SELECT id FROM users WHERE account_id = ? COLLATE NOCASE LIMIT 1";
  const bindings = [validated.value];

  if (excludeUserId != null) {
    query =
      "SELECT id FROM users WHERE account_id = ? COLLATE NOCASE AND id != ? LIMIT 1";
    bindings.push(Math.trunc(Number(excludeUserId)));
  }

  const row = await env.DB.prepare(query).bind(...bindings).first();
  return {
    available: !row,
    accountId: validated.value,
  };
}
