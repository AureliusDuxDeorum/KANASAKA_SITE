const schemaCache = new Map();

function columnNames(result) {
  return (result?.results || []).map(function (row) {
    return row.name;
  });
}

async function tableColumns(env, tableName) {
  const result = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  return columnNames(result);
}

export async function getAuthSchema(env) {
  if (!env?.DB) {
    return {
      emailTokensHashed: false,
      sessionsHashed: false,
      sessionsRotatable: false,
    };
  }

  const cacheKey = env.DB.toString();
  if (schemaCache.has(cacheKey)) {
    return schemaCache.get(cacheKey);
  }

  try {
    const emailColumns = await tableColumns(env, "email_tokens");
    const sessionColumns = await tableColumns(env, "sessions");
    const schema = {
      emailTokensHashed: emailColumns.includes("token_hash"),
      sessionsHashed: sessionColumns.includes("token_hash"),
      sessionsRotatable: sessionColumns.includes("last_rotated_at"),
      sessionsRememberable: sessionColumns.includes("remember"),
    };
    schemaCache.set(cacheKey, schema);
    return schema;
  } catch (err) {
    console.error("Auth schema detection failed:", err);
    return {
      emailTokensHashed: true,
      sessionsHashed: true,
      sessionsRotatable: true,
      sessionsRememberable: false,
    };
  }
}

export function clearAuthSchemaCache() {
  schemaCache.clear();
}

export async function usersHaveTosColumns(env) {
  if (!env?.DB) {
    return false;
  }

  try {
    const columns = await tableColumns(env, "users");
    return columns.includes("tos_accepted_at") && columns.includes("tos_version");
  } catch {
    return false;
  }
}

export async function usersHaveAccountIdColumn(env) {
  if (!env?.DB) {
    return false;
  }

  try {
    const columns = await tableColumns(env, "users");
    return columns.includes("account_id") && columns.includes("role");
  } catch {
    return false;
  }
}

export async function usersHaveAccountIdChangedAtColumn(env) {
  if (!env?.DB) {
    return false;
  }

  try {
    const columns = await tableColumns(env, "users");
    return columns.includes("account_id_changed_at");
  } catch {
    return false;
  }
}

export async function usersHaveTwofaEmailColumn(env) {
  if (!env?.DB) {
    return false;
  }

  try {
    const columns = await tableColumns(env, "users");
    return columns.includes("twofa_email_enabled");
  } catch {
    return false;
  }
}

// Migration 021. Checked before an app sign-in spends a password check, a challenge or a one-time backup code on a session that
// could not be stored. Only a positive answer is remembered, so running the migration needs no redeploy.
export async function appSessionsTableExists(env) {
  if (!env?.DB) {
    return false;
  }

  const key = "app_sessions:" + env.DB.toString();
  if (schemaCache.get(key)) {
    return true;
  }

  try {
    const exists = (await tableColumns(env, "app_sessions")).length > 0;
    if (exists) schemaCache.set(key, true);
    return exists;
  } catch {
    return false;
  }
}

export async function twofaChallengesHaveRememberColumn(env) {
  if (!env?.DB) {
    return false;
  }

  try {
    const columns = await tableColumns(env, "twofa_challenges");
    return columns.includes("remember");
  } catch {
    return false;
  }
}

export async function usersHaveKsStocksSubscriptionColumns(env) {
  if (!env?.DB) {
    return false;
  }

  try {
    const columns = await tableColumns(env, "users");
    return (
      columns.includes("ks_stocks_subscription_status") &&
      columns.includes("ks_stocks_subscription_ends_at")
    );
  } catch {
    return false;
  }
}
