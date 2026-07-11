import {
  createSession,
  errorResponse,
  jsonResponse,
  readJson,
  sessionCookieHeader,
  validatePassword,
  verifyPassword,
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

  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!username || !validatePassword(password)) {
    return errorResponse("Invalid username or password.", 401);
  }

  const user = await env.DB.prepare(
    "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE"
  )
    .bind(username)
    .first();

  if (!user) {
    return errorResponse("Invalid username or password.", 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return errorResponse("Invalid username or password.", 401);
  }

  const session = await createSession(env, user.id);

  return jsonResponse(
    { authenticated: true, username: user.username },
    200,
    {
      "Set-Cookie": sessionCookieHeader(session.token, session.maxAge),
    }
  );
}
