import { errorResponse, jsonResponse } from "../../lib/auth.js";
import { isAccountIdAvailable } from "../../lib/account-id.js";

export async function onRequestGet(context) {
  const { env, request } = context;

  if (!env.DB) {
    return errorResponse("Authentication service is not configured.", 503);
  }

  const params = new URL(request.url).searchParams;
  const accountId = params.get("accountId") || params.get("id") || "";

  const result = await isAccountIdAvailable(env, accountId);
  if (result.error) {
    return jsonResponse({ available: false, error: result.error });
  }

  return jsonResponse({
    available: result.available,
    accountId: result.accountId,
  });
}
