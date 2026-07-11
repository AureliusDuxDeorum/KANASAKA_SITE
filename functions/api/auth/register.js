import {
  createEmailToken,
  errorResponse,
  hashPassword,
  jsonResponse,
  normalizeEmail,
  readJson,
  validateEmail,
  validatePassword,
  VERIFY_TOKEN_HOURS,
} from "../../lib/auth.js";
import { sendVerificationEmail } from "../../lib/email.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  try {
    const body = await readJson(request);
    if (!body) {
      return errorResponse("Invalid request body.");
    }

    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!validateEmail(email)) {
      return errorResponse("Enter a valid email address.");
    }

    if (!validatePassword(password)) {
      return errorResponse("Password must be at least 8 characters.");
    }

    const existing = await env.DB.prepare(
      "SELECT id, email_verified FROM users WHERE email = ? COLLATE NOCASE"
    )
      .bind(email)
      .first();

    if (existing) {
      if (existing.email_verified) {
        return errorResponse("An account with this email already exists.", 409);
      }
      return errorResponse(
        "This email is already registered but not verified. Check your inbox or request a new verification email.",
        409
      );
    }

    const passwordHash = await hashPassword(password);

    const result = await env.DB.prepare(
      "INSERT INTO users (email, password_hash, email_verified) VALUES (?, ?, 0)"
    )
      .bind(email, passwordHash)
      .run();

    let userId = result.meta && result.meta.last_row_id;
    if (!userId) {
      const inserted = await env.DB.prepare(
        "SELECT id FROM users WHERE email = ? COLLATE NOCASE"
      )
        .bind(email)
        .first();
      userId = inserted && inserted.id;
    }

    if (!userId) {
      throw new Error("User insert did not return an id.");
    }

    const token = await createEmailToken(env, userId, "verify", VERIFY_TOKEN_HOURS);
    const sent = await sendVerificationEmail(env, email, token);

    if (!sent) {
      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
      return errorResponse(
        "Could not send verification email. Check RESEND_API_KEY and domain setup in Cloudflare.",
        503
      );
    }

    return jsonResponse(
      {
        success: true,
        message: "Check your email to confirm your account before signing in.",
        email,
      },
      201
    );
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    console.error("Register failed:", message);

    if (
      message.includes("no such column") ||
      message.includes("no such table") ||
      message.includes("email_tokens")
    ) {
      return errorResponse(
        "Auth database is outdated. Run migrations/002_email_auth.sql on D1.",
        503
      );
    }

    if (message.includes("FOREIGN KEY constraint failed")) {
      return errorResponse(
        "Registration failed due to a database error. Please try again.",
        500
      );
    }

    if (message.includes("UNIQUE constraint failed")) {
      return errorResponse(
        "An account with this email already exists. Try signing in or resetting your password.",
        409
      );
    }

    return errorResponse("Registration failed. Please try again later.", 500);
  }
}
