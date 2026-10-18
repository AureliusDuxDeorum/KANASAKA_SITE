import { errorResponse, jsonResponse, readJson, verifyPassword } from "../../lib/auth.js";
import { markLegalNoticeEmailed, publishLegalNotice } from "../../lib/legal-notices.js";
import { sendLegalNoticeEmail } from "../../lib/email.js";
import {
  adminActorLabel,
  clientIp,
  logAuthEvent,
  requireAdminAccess,
  requireSameOrigin,
  throttleAdminAction,
} from "../../lib/security.js";

// Publishes a new version of a legal notice (cookies, tos, privacy, ...)
// and immediately emails every verified user -- see functions/lib/legal-
// notices.js for how the in-app banner picks the same row up afterward.
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return errorResponse("Service is not configured.", 503);
  }

  const originError = requireSameOrigin(request, env);
  if (originError) return originError;

  const { user: actingUser, error: adminError } = await requireAdminAccess(request, env);
  if (adminError) return adminError;

  const actor = adminActorLabel(actingUser);
  if (await throttleAdminAction(env, "legal_notice_published", actor, { max: 5, windowMinutes: 10 })) {
    return errorResponse("Too many notices published recently. Try again later.", 429);
  }

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Invalid request body.");
  }

  // Step-up re-authentication, same as account-role.js: this mass-emails
  // every verified user, so a session cookie alone shouldn't be enough even
  // from an already-logged-in admin (stolen/hijacked session, unattended
  // device). Bearer-secret access skips this -- it's a separate, already-
  // strong trust channel with no "current password" to check. Logged under
  // the same admin_role_update_failed event requireAdminAccess's escalating
  // lockout already watches, so repeated failures here count toward it too.
  if (actingUser) {
    const password = String(body.currentPassword || "");
    if (!password) {
      return errorResponse("Enter your current password to confirm this.");
    }

    const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?")
      .bind(actingUser.id)
      .first();

    const validPassword = row && (await verifyPassword(password, row.password_hash, env));
    if (!validPassword) {
      await logAuthEvent(env, "admin_role_update_failed", {
        ip: clientIp(request),
        email: actor,
        reason: "bad_step_up_password_legal_notice",
      });
      return errorResponse("Current password is incorrect.", 401);
    }
  }

  const noticeType = String(body.noticeType || "").trim().toLowerCase();
  const version = String(body.version || "").trim();
  const title = String(body.title || "").trim();
  const summary = String(body.summary || "").trim();
  const url = String(body.url || "").trim();

  if (!noticeType || !version || !title || !summary || !url) {
    return errorResponse("noticeType, version, title, summary, and url are all required.");
  }

  try {
    await publishLegalNotice(env, { noticeType, version, title, summary, url });
  } catch (err) {
    const message = String((err && err.message) || err);
    if (message.includes("UNIQUE constraint failed")) {
      return errorResponse("That notice_type/version has already been published.");
    }
    if (message.includes("no such table")) {
      return errorResponse("Run migrations/017_legal_notices.sql on D1 first.", 503);
    }
    throw err;
  }

  const { results: recipients } = await env.DB.prepare(
    "SELECT email FROM users WHERE email_verified = 1"
  ).all();

  let sent = 0;
  let failed = 0;
  for (const row of recipients || []) {
    const result = await sendLegalNoticeEmail(env, row.email, { title, summary, url });
    if (result.ok) {
      sent++;
    } else {
      failed++;
    }
  }

  await markLegalNoticeEmailed(env, noticeType, version);
  await logAuthEvent(env, "legal_notice_published", { actor, noticeType, version, sent, failed });

  return jsonResponse({
    ok: true,
    noticeType,
    version,
    recipients: (recipients || []).length,
    sent,
    failed,
  });
}
