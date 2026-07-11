import {
  createSession,
  errorResponse,
  hashPassword,
  jsonResponse,
  readJson,
  sessionCookieHeader,
  validatePassword,
  validateUsername,
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

  if (!validateUsername(username)) {
    return errorResponse(
      "Username must be 3–32 characters and use letters, numbers, or underscores."
    );
  }

  if (!validatePassword(password)) {
    return errorResponse("Password must be at least 8 characters.");
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE username = ? COLLATE NOCASE"
  )
    .bind(username)
    .first();

  if (existing) {
    return errorResponse("Username is already taken.", 409);
  }

  const passwordHash = await hashPassword(password);

  const result = await env.DB.prepare(
    "INSERT INTO users (username, password_hash) VALUES (?, ?)"
  )
    .bind(username, passwordHash)
    .run();

  const userId = result.meta.last_row_id;
  const session = await createSession(env, userId);

  return jsonResponse(
    { authenticated: true, username },
    201,
    {
      "Set-Cookie": sessionCookieHeader(session.token, session.maxAge),
    }
  );
}
