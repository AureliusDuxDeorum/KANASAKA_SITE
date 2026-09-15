// Anti-phishing security phrase (Coinbase/Binance pattern): a user-chosen
// phrase stamped into every security-sensitive email so a lookalike phishing
// email -- which won't know the phrase -- is immediately recognizable as fake.
export const SECURITY_PHRASE_MAX_LENGTH = 40;

async function columnExists(env) {
  try {
    await env.DB.prepare("SELECT security_phrase FROM users LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}

export async function getSecurityPhrase(env, userId) {
  if (!(await columnExists(env))) {
    return null;
  }

  const row = await env.DB.prepare("SELECT security_phrase FROM users WHERE id = ?")
    .bind(userId)
    .first();

  return row && row.security_phrase ? String(row.security_phrase) : null;
}

export async function setSecurityPhrase(env, userId, phrase) {
  if (!(await columnExists(env))) {
    throw new Error("Security phrase column is not available yet.");
  }

  const trimmed = String(phrase || "").trim().slice(0, SECURITY_PHRASE_MAX_LENGTH);
  await env.DB.prepare("UPDATE users SET security_phrase = ? WHERE id = ?")
    .bind(trimmed || null, userId)
    .run();

  return trimmed || null;
}
