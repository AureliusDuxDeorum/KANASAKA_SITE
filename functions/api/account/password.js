import {
  errorResponse,
  getSessionUser,
  hashPassword,
  jsonResponse,
  readJson,
  validatePassword,
  verifyPassword,
} from "../../lib/auth.js";

export async function onRequestPost(context) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) {
    return errorResponse("Log in to change your password.", 401);
  }

  const body = await readJson(context.request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  if (!validatePassword(newPassword)) {
    return errorResponse("New password must be at least 8 characters.");
  }

  const row = await context.env.DB.prepare(
    "SELECT password_hash FROM users WHERE id = ?"
  )
    .bind(user.id)
    .first();

  if (!row) {
    return errorResponse("Account not found.", 404);
  }

  const valid = await verifyPassword(currentPassword, row.password_hash);
  if (!valid) {
    return errorResponse("Current password is incorrect.", 401);
  }

  const samePassword = await verifyPassword(newPassword, row.password_hash);
  if (samePassword) {
    return errorResponse("Choose a different password than your current one.");
  }

  const passwordHash = await hashPassword(newPassword);
  await context.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(passwordHash, user.id)
    .run();

  return jsonResponse({
    success: true,
    message: "Password updated.",
  });
}
