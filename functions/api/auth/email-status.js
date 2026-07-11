import { jsonResponse } from "../../lib/auth.js";
import { getEmailStatus } from "../../lib/email.js";

export async function onRequestGet(context) {
  const status = await getEmailStatus(context.env);
  return jsonResponse(status);
}
