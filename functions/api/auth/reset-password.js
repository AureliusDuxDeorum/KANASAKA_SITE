import {
  consumeEmailToken,
  errorResponse,
  hashPassword,
  jsonResponse,
  readJson,
  validatePassword,
} from "../../lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const token = String(body.token || "").trim();
  const password = String(body.password || "");

  if (!token) {
    return errorResponse("Reset token is required.", 400);
  }

  if (!validatePassword(password)) {
    return errorResponse("Password must be at least 8 characters.");
  }

  const record = await consumeEmailToken(env, token, "reset");
  if (!record) {
    return errorResponse("Reset link is invalid or has expired.", 400);
  }

  const passwordHash = await hashPassword(password);

  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(passwordHash, record.user_id)
    .run();

  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?")
    .bind(record.user_id)
    .run();

  return jsonResponse({
    success: true,
    message: "Password updated. You can now sign in with your new password.",
  });
}
