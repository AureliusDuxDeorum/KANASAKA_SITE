import {
  clearSessionCookieHeader,
  deleteSession,
  errorResponse,
  getSessionUser,
  jsonResponse,
  parseCookies,
  readJson,
  SESSION_COOKIE,
  verifyPassword,
} from "../../lib/auth.js";
import { deleteAvatar } from "../../lib/profile.js";
import { logAuthEvent, requireSameOrigin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const user = await getSessionUser(request, env);
  if (!user) {
    return errorResponse("Log in to delete your account.", 401);
  }

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const password = String(body.password || "");
  const confirmation = String(body.confirmation || "");

  if (confirmation !== "DELETE") {
    return errorResponse('Type DELETE in the confirmation field to continue.');
  }

  const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(user.id)
    .first();

  if (!row) {
    return errorResponse("Account not found.", 404);
  }

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    return errorResponse("Password is incorrect.", 401);
  }

  const cookies = parseCookies(request);
  const sessionToken = cookies[SESSION_COOKIE];

  await deleteAvatar(env, user.id);
  await env.DB.prepare("DELETE FROM email_tokens WHERE user_id = ?").bind(user.id).run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();

  await logAuthEvent(env, "account_deleted", { userId: user.id });

  if (sessionToken) {
    await deleteSession(env, sessionToken);
  }

  return jsonResponse(
    { success: true, message: "Your account has been deleted." },
    200,
    { "Set-Cookie": clearSessionCookieHeader() }
  );
}
