// Reusable legal/policy-update notice system. publishLegalNotice() is the
// only thing a future policy change needs to call -- the pending-notice
// banner and the email blast both key off notice_type/version, so nothing
// here is specific to "cookies".

export async function getActiveLegalNotices(env) {
  if (!env.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT n.* FROM legal_notices n
       INNER JOIN (
         SELECT notice_type, MAX(id) AS max_id FROM legal_notices GROUP BY notice_type
       ) latest ON latest.max_id = n.id`
    ).all();
    return results || [];
  } catch {
    // Table doesn't exist yet (migration not applied) -- no notices rather
    // than a hard error, same fails-open spirit as logAuthEvent.
    return [];
  }
}

export async function getPendingLegalNotices(env, userId) {
  const active = await getActiveLegalNotices(env);
  if (!active.length) return [];

  try {
    const { results: acks } = await env.DB.prepare(
      "SELECT notice_type, version FROM legal_notice_acks WHERE user_id = ?"
    )
      .bind(userId)
      .all();
    const ackedVersion = new Map((acks || []).map((a) => [a.notice_type, a.version]));
    return active.filter((n) => ackedVersion.get(n.notice_type) !== n.version);
  } catch {
    return [];
  }
}

export async function acknowledgeLegalNotice(env, userId, noticeType, version) {
  await env.DB.prepare(
    `INSERT INTO legal_notice_acks (user_id, notice_type, version, acknowledged_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, notice_type) DO UPDATE SET
       version = excluded.version,
       acknowledged_at = excluded.acknowledged_at`
  )
    .bind(userId, noticeType, version)
    .run();
}

export async function publishLegalNotice(env, { noticeType, version, title, summary, url }) {
  await env.DB.prepare(
    `INSERT INTO legal_notices (notice_type, version, title, summary, url, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(noticeType, version, title, summary, url)
    .run();
}

export async function markLegalNoticeEmailed(env, noticeType, version) {
  await env.DB.prepare(
    "UPDATE legal_notices SET emailed_at = datetime('now') WHERE notice_type = ? AND version = ?"
  )
    .bind(noticeType, version)
    .run();
}
