import { errorResponse, jsonResponse, readJson, resolveSession } from "../../lib/auth.js";
import {
  getUserProfile,
  profilePayload,
  validateDisplayName,
} from "../../lib/profile.js";
import {
  formatAccountIdChangeDate,
  getAccountIdChangeStatus,
  isAccountIdAvailable,
  normalizeAccountId,
  validateAccountId,
} from "../../lib/account-id.js";
import {
  usersHaveAccountIdChangedAtColumn,
  usersHaveAccountIdColumn,
} from "../../lib/schema.js";
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
  let accountIdChanged = false;
  const hasAccountIdColumn = await usersHaveAccountIdColumn(context.env);
  const hasChangedAtColumn = await usersHaveAccountIdChangedAtColumn(context.env);

  if (hasAccountIdColumn && typeof body.accountId === "string") {
    const requestedId = body.accountId.trim();
    if (requestedId) {
      const validatedAccountId = validateAccountId(requestedId);
      if (!validatedAccountId.ok) {
        return errorResponse(validatedAccountId.error);
      }

      const currentId = profile.account_id
        ? normalizeAccountId(profile.account_id)
        : null;

      if (currentId !== validatedAccountId.value) {
        if (profile.account_id) {
          const changeStatus = getAccountIdChangeStatus(
            profile.account_id_changed_at,
            profile.account_id
          );

          if (!changeStatus.allowed) {
            const nextDate = formatAccountIdChangeDate(changeStatus.nextChangeAt);
            return errorResponse(
              nextDate
                ? "Account ID can only be changed every 6 months. Next change available on " +
                    nextDate +
                    "."
                : "Account ID can only be changed every 6 months."
            );
          }
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
        accountIdChanged = true;
      }
    }
  }

  if (hasAccountIdColumn) {
    if (hasChangedAtColumn && accountIdChanged) {
      await context.env.DB.prepare(
        "UPDATE users SET display_name = ?, account_id = ?, account_id_changed_at = datetime('now') WHERE id = ?"
      )
        .bind(displayName, accountId, user.id)
        .run();
    } else {
      await context.env.DB.prepare(
        "UPDATE users SET display_name = ?, account_id = ? WHERE id = ?"
      )
        .bind(displayName, accountId, user.id)
        .run();
    }
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
