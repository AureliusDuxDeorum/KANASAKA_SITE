import { jsonResponse } from "../../lib/auth.js";
import { getEmailStatus } from "../../lib/email.js";
import { requireAdmin } from "../../lib/security.js";

export async function onRequestGet(context) {
  const adminError = requireAdmin(context.request, context.env);
  if (adminError) return adminError;

  const status = await getEmailStatus(context.env);
  return jsonResponse(status);
}
