import { errorResponse, jsonResponse, readJson, resolveSession } from "../../lib/auth.js";
import {
  getUserProfile,
  profilePayload,
  validateDisplayName,
} from "../../lib/profile.js";
import {
  isAccountIdAvailable,
  validateAccountId,
} from "../../lib/account-id.js";
import { usersHaveAccountIdColumn } from "../../lib/schema.js";
import { requireSameOrigin } from "../../lib/security.js";

export async function onRequestGet(context) {
  const { user, sessionHeaders } = await resolveSession(context.request, context.env);
  if (!user) {
    return errorResponse("Log in to view account settings.", 401);
  }

  const profile = await getUserProfile(context.env, user.id);
  if (!profile) {
    return errorResponse("Account not found.", 404);
  }

  return jsonResponse(profilePayload(profile), 200, sessionHeaders);
}

export async function onRequestPatch(context) {
  const originError = requireSameOrigin(context.request, context.env);
  if (originError) return originError;

  const { user, sessionHeaders } = await resolveSession(context.request, context.env);
  if (!user) {
    return errorResponse("Log in to update account settings.", 401);
  }

  const body = await readJson(context.request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  const profile = await getUserProfile(context.env, user.id);
  if (!profile) {
    return errorResponse("Account not found.", 404);
  }

  let displayName = profile.display_name;
  if (typeof body.displayName === "string") {
    const validated = validateDisplayName(body.displayName);
    if (!validated.ok) {
      return errorResponse(validated.error);
    }
    displayName = validated.value;
  }

  let accountId = profile.account_id;
  const hasAccountIdColumn = await usersHaveAccountIdColumn(context.env);

  if (hasAccountIdColumn && typeof body.accountId === "string") {
    const requestedId = body.accountId.trim();
    if (requestedId) {
      if (profile.account_id) {
        return errorResponse("Your account ID cannot be changed after it is set.");
      }

      const validatedAccountId = validateAccountId(requestedId);
      if (!validatedAccountId.ok) {
        return errorResponse(validatedAccountId.error);
      }

      const availability = await isAccountIdAvailable(
        context.env,
        validatedAccountId.value,
        user.id
      );
      if (!availability.available) {
        return errorResponse("That account ID is already taken.");
      }

      accountId = availability.accountId;
    }
  }

  if (hasAccountIdColumn) {
    await context.env.DB.prepare(
      "UPDATE users SET display_name = ?, account_id = ? WHERE id = ?"
    )
      .bind(displayName, accountId, user.id)
      .run();
  } else {
    await context.env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?")
      .bind(displayName, user.id)
      .run();
  }

  const updated = await getUserProfile(context.env, user.id);
  return jsonResponse(
    {
      success: true,
      message: "Profile updated.",
      ...profilePayload(updated),
    },
    200,
    sessionHeaders
  );
}
