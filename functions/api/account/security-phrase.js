import {
  errorResponse,
  getSessionUser,
  jsonResponse,
  readJson,
  verifyPassword,
} from "../../lib/auth.js";
import { getSecurityPhrase, setSecurityPhrase } from "../../lib/security-phrase.js";
import { clientIp, logAuthEvent, requireSameOrigin } from "../../lib/security.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Log in to manage your security phrase.", 401);
  }

  const phrase = await getSecurityPhrase(env, user.id);
  return jsonResponse({ securityPhrase: phrase });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Log in to manage your security phrase.", 401);
  }

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const currentPassword = String(body.currentPassword || "");
  const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(user.id)
    .first();

  const validPassword = row && (await verifyPassword(currentPassword, row.password_hash, env));
  if (!validPassword) {
    return errorResponse("Current password is incorrect.", 401);
  }

  let phrase;
  try {
    phrase = await setSecurityPhrase(env, user.id, body.securityPhrase);
  } catch (err) {
    return errorResponse(err.message || "Could not save security phrase.", 503);
  }

  await logAuthEvent(env, "security_phrase_updated", {
    ip: clientIp(request),
    userId: user.id,
    cleared: !phrase,
  });

  return jsonResponse({
    success: true,
    securityPhrase: phrase,
    message: phrase ? "Security phrase saved." : "Security phrase cleared.",
  });
}
