import {
  createEmailToken,
  errorMessage,
  errorResponse,
  hashPassword,
  insertUser,
  jsonResponse,
  normalizeEmail,
  readJson,
  validateEmail,
  validatePassword,
  VERIFY_TOKEN_HOURS,
} from "../../lib/auth.js";
import { sendVerificationEmail } from "../../lib/email.js";

function registerFailure(err) {
  const message = errorMessage(err);
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

  if (message.includes("Invalid user id for email token")) {
    return errorResponse(
      "Registration failed while creating your verification link. Please try again.",
      500
    );
  }

  if (message.includes("User insert")) {
    return errorResponse(
      "Registration failed while saving your account. Please try again.",
      500
    );
  }

  if (message.includes("D1_ERROR")) {
    return errorResponse(message.replace(/^D1_ERROR:\s*/, "").slice(0, 180), 500);
  }

  if (
    message.includes("SQLITE_CONSTRAINT") ||
    message.includes("readonly") ||
    message.includes("read-only") ||
    message.includes("OperationError") ||
    message.includes("DataError")
  ) {
    return errorResponse(message.slice(0, 180), 500);
  }

  return errorResponse("Registration failed. Please try again later.", 500);
}

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
    const userId = await insertUser(env, email, passwordHash);
    const token = await createEmailToken(env, userId, "verify", VERIFY_TOKEN_HOURS);
    const sent = await sendVerificationEmail(env, email, token);

    if (!sent) {
      try {
        await env.DB.prepare("DELETE FROM email_tokens WHERE user_id = ?")
          .bind(userId)
          .run();
        await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
      } catch (rollbackErr) {
        console.error("Register rollback failed:", errorMessage(rollbackErr));
      }
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
    return registerFailure(err);
  }
}
