import {
  createEmailToken,
  errorMessage,
  errorResponse,
  hashPassword,
  insertUser,
  jsonResponse,
  normalizeEmail,
  readJson,
  REGISTER_SUCCESS_MESSAGE,
  validateEmail,
  passwordValidationError,
  VERIFY_TOKEN_HOURS,
} from "../../lib/auth.js";
import { sendVerificationEmail } from "../../lib/email.js";
import { clientIp, logAuthEvent, requireSameOrigin } from "../../lib/security.js";

function registerFailure(err) {
  const message = errorMessage(err);
  console.error("Register failed:", message);

  if (
    message.includes("no such column") ||
    message.includes("no such table") ||
    message.includes("email_tokens")
  ) {
    return errorResponse(
      "Auth database is outdated. Run migrations on D1 (see migrations/).",
      503
    );
  }

  if (message.includes("FOREIGN KEY constraint failed")) {
    return errorResponse(
      "Registration failed due to a database error. Please try again.",
      500
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
    message.includes("DataError") ||
    message.includes("CPU") ||
    message.includes("exceeded")
  ) {
    return errorResponse(message.slice(0, 180), 500);
  }

  return errorResponse("Registration failed. Please try again later.", 500);
}

function registerSuccessResponse(status = 201) {
  return jsonResponse(
    {
      success: true,
      message: REGISTER_SUCCESS_MESSAGE,
    },
    status
  );
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const ip = clientIp(request);

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

    const passwordError = passwordValidationError(password);
    if (passwordError) {
      return errorResponse(passwordError);
    }

    const existing = await env.DB.prepare(
      "SELECT id, email_verified FROM users WHERE email = ? COLLATE NOCASE"
    )
      .bind(email)
      .first();

    if (existing) {
      if (!existing.email_verified) {
        const token = await createEmailToken(
          env,
          existing.id,
          "verify",
          VERIFY_TOKEN_HOURS
        );
        await sendVerificationEmail(env, email, token);
      }
      await logAuthEvent(env, "register_existing", { ip });
      return registerSuccessResponse(200);
    }

    const passwordHash = await hashPassword(password, env);
    const userId = await insertUser(env, email, passwordHash);
    const token = await createEmailToken(env, userId, "verify", VERIFY_TOKEN_HOURS);
    const emailResult = await sendVerificationEmail(env, email, token);

    if (!emailResult.ok) {
      try {
        await env.DB.prepare("DELETE FROM email_tokens WHERE user_id = ?")
          .bind(userId)
          .run();
        await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
      } catch (rollbackErr) {
        console.error("Register rollback failed:", errorMessage(rollbackErr));
      }
      return errorResponse(emailResult.reason, 503);
    }

    await logAuthEvent(env, "register_success", { ip, userId });
    return registerSuccessResponse(201);
  } catch (err) {
    return registerFailure(err);
  }
}
