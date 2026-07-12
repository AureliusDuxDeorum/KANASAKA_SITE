import { errorResponse, getSessionUser, jsonResponse, readJson } from "../../lib/auth.js";
import { getUserProfile, profilePayload, validateDisplayName } from "../../lib/profile.js";
import { requireSameOrigin } from "../../lib/security.js";

export async function onRequestGet(context) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) {
    return errorResponse("Log in to view account settings.", 401);
  }

  const profile = await getUserProfile(context.env, user.id);
  if (!profile) {
    return errorResponse("Account not found.", 404);
  }

  return jsonResponse(profilePayload(profile));
}

export async function onRequestPatch(context) {
  const originError = requireSameOrigin(context.request, context.env);
  if (originError) return originError;

  const user = await getSessionUser(context.request, context.env);
  if (!user) {
    return errorResponse("Log in to update account settings.", 401);
  }

  const body = await readJson(context.request);
  if (!body || typeof body.displayName !== "string") {
    return errorResponse("Invalid request body.");
  }

  const validated = validateDisplayName(body.displayName);
  if (!validated.ok) {
    return errorResponse(validated.error);
  }

  await context.env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?")
    .bind(validated.value, user.id)
    .run();

  const profile = await getUserProfile(context.env, user.id);
  return jsonResponse({
    success: true,
    message: "Profile updated.",
    ...profilePayload(profile),
  });
}
