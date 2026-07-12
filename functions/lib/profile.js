export const AVATAR_MAX_BYTES = 512 * 1024;
export const DISPLAY_NAME_MAX = 40;

export const AVATAR_MIME_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function validateDisplayName(value) {
  const name = String(value || "").trim();
  if (!name) {
    return { ok: true, value: null };
  }

  if (name.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: "Display name must be " + DISPLAY_NAME_MAX + " characters or less." };
  }

  if (!/^[\p{L}\p{N} ._\-']+$/u.test(name)) {
    return {
      ok: false,
      error: "Display name can only contain letters, numbers, spaces, and . _ - '",
    };
  }

  return { ok: true, value: name };
}

export function displayLabel(user) {
  if (user && user.display_name) {
    return user.display_name;
  }
  if (user && user.email) {
    return user.email.split("@")[0];
  }
  return "Account";
}

export function avatarInitials(user) {
  const label = displayLabel(user);
  const parts = label.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return label.slice(0, 2).toUpperCase();
}

export async function getUserProfile(env, userId) {
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, ua.mime_type, ua.updated_at AS avatar_updated_at
     FROM users u
     LEFT JOIN user_avatars ua ON ua.user_id = u.id
     WHERE u.id = ?`
  )
    .bind(userId)
    .first();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    has_avatar: Boolean(row.mime_type),
    avatar_updated_at: row.avatar_updated_at,
  };
}

export function profilePayload(user) {
  const hasAvatar = Boolean(user && user.has_avatar);
  const version = user && user.avatar_updated_at ? encodeURIComponent(user.avatar_updated_at) : "";

  return {
    email: user.email,
    displayName: user.display_name || null,
    displayLabel: displayLabel(user),
    initials: avatarInitials(user),
    hasAvatar,
    avatarUrl: hasAvatar ? "/api/account/avatar?v=" + version : null,
  };
}

export async function saveAvatar(env, userId, mimeType, bytes) {
  await env.DB.prepare(
    `INSERT INTO user_avatars (user_id, mime_type, data, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       mime_type = excluded.mime_type,
       data = excluded.data,
       updated_at = datetime('now')`
  )
    .bind(userId, mimeType, bytes)
    .run();
}

export async function deleteAvatar(env, userId) {
  await env.DB.prepare("DELETE FROM user_avatars WHERE user_id = ?").bind(userId).run();
}

export async function getAvatarRecord(env, userId) {
  return env.DB.prepare(
    "SELECT mime_type, data, updated_at FROM user_avatars WHERE user_id = ?"
  )
    .bind(userId)
    .first();
}
