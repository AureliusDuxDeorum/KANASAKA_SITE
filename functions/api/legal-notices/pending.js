import { jsonResponse, resolveSession } from "../../lib/auth.js";
import { getPendingLegalNotices } from "../../lib/legal-notices.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return jsonResponse({ notices: [] });
  }

  const { user } = await resolveSession(request, env);
  if (!user) {
    return jsonResponse({ notices: [] });
  }

  const notices = await getPendingLegalNotices(env, user.id);

  return jsonResponse({
    notices: notices.map(function (n) {
      return {
        noticeType: n.notice_type,
        version: n.version,
        title: n.title,
        summary: n.summary,
        url: n.url,
      };
    }),
  });
}
