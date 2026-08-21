import { errorResponse, jsonResponse, readJson } from "../../lib/auth.js";
import { normalizeAccountId, validateAccountId } from "../../lib/account-id.js";
import { normalizeRole, ROLES } from "../../lib/roles.js";
import { clientIp, logAuthEvent, requireAdmin } from "../../lib/security.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const adminError = requireAdmin(request, env);
  if (adminError) return adminError;

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const accountId = normalizeAccountId(body.accountId);
  const validated = validateAccountId(accountId);
  if (!validated.ok) {
    return errorResponse(validated.error);
  }

  const role = normalizeRole(body.role);
  if (!Object.values(ROLES).includes(role)) {
    return errorResponse(
      "Role must be one of: " + Object.values(ROLES).join(", ") + "."
    );
  }

  const user = await env.DB.prepare(
    "SELECT id, account_id, role FROM users WHERE account_id = ? COLLATE NOCASE"
  )
    .bind(validated.value)
    .first();

  if (!user) {
    return errorResponse("No account found with that ID.", 404);
  }

  await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?")
    .bind(role, user.id)
    .run();

  await logAuthEvent(env, "admin_role_updated", {
    ip: clientIp(request),
    userId: user.id,
    accountId: validated.value,
    role,
  });

  return jsonResponse({
    success: true,
    accountId: validated.value,
    role,
    message: "Role updated for @" + validated.value + ".",
  });
}
