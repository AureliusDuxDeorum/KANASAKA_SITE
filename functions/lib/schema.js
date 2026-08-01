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
    };
    schemaCache.set(cacheKey, schema);
    return schema;
  } catch (err) {
    console.error("Auth schema detection failed:", err);
    return {
      emailTokensHashed: true,
      sessionsHashed: true,
      sessionsRotatable: true,
    };
  }
}

export function clearAuthSchemaCache() {
  schemaCache.clear();
}
