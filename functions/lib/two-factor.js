import {
  buildOtpAuthUri,
  generateBackupCodes,
  generateTotpSecret,
  normalizeBackupCode,
  verifyTotpCode,
} from "./totp.js";
import { generateRawToken, hashSecret } from "./tokens.js";

const TOTP_ISSUER = "KANASAKA";
const CHALLENGE_MINUTES = 5;

async function deriveAesKey(env) {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    return null;
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("kanasaka-totp-v1"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach(function (byte) {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptTotpSecret(plainSecret, env) {
  const key = await deriveAesKey(env);
  if (!key) {
    throw new Error("SESSION_SECRET is required for two-factor authentication.");
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(String(plainSecret))
  );

  return bytesToBase64(iv) + ":" + bytesToBase64(new Uint8Array(ciphertext));
}

export async function decryptTotpSecret(stored, env) {
  if (!stored) return null;

  const key = await deriveAesKey(env);
  if (!key) {
    throw new Error("SESSION_SECRET is required for two-factor authentication.");
  }

  const parts = String(stored).split(":");
  if (parts.length !== 2) {
    return null;
  }

  const iv = base64ToBytes(parts[0]);
  const ciphertext = base64ToBytes(parts[1]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plain);
}

export async function beginTotpSetup(env, userId, email) {
  const secret = generateTotpSecret();
  const encrypted = await encryptTotpSecret(secret, env);

  await env.DB.prepare("UPDATE users SET totp_pending_secret = ? WHERE id = ?")
    .bind(encrypted, userId)
    .run();

  return {
    secret,
    otpauthUrl: buildOtpAuthUri(email, secret, TOTP_ISSUER),
  };
}

export async function enableTotp(env, userId, code) {
  const row = await env.DB.prepare(
    "SELECT totp_pending_secret, totp_enabled FROM users WHERE id = ?"
  )
    .bind(userId)
    .first();

  if (!row || !row.totp_pending_secret) {
    throw new Error("Two-factor setup has not been started.");
  }

  if (row.totp_enabled) {
    throw new Error("Two-factor authentication is already enabled.");
  }

  const secret = await decryptTotpSecret(row.totp_pending_secret, env);
  if (!secret) {
    throw new Error("Two-factor setup is invalid. Start again.");
  }

  const valid = await verifyTotpCode(secret, code);
  if (!valid) {
    throw new Error("Invalid authenticator code.");
  }

  const backupCodes = generateBackupCodes(8);
  const encryptedActive = await encryptTotpSecret(secret, env);

  await env.DB.prepare(
    `UPDATE users
     SET totp_secret = ?, totp_pending_secret = NULL, totp_enabled = 1,
         totp_enabled_at = datetime('now')
     WHERE id = ?`
  )
    .bind(encryptedActive, userId)
    .run();

  await env.DB.prepare("DELETE FROM twofa_backup_codes WHERE user_id = ?").bind(userId).run();

  for (const backupCode of backupCodes) {
    const normalized = normalizeBackupCode(backupCode);
    const codeHash = await hashSecret("backup:" + normalized, env);
    await env.DB.prepare(
      "INSERT INTO twofa_backup_codes (user_id, code_hash) VALUES (?, ?)"
    )
      .bind(userId, codeHash)
      .run();
  }

  return backupCodes;
}

export async function disableTotp(env, userId) {
  await env.DB.prepare(
    `UPDATE users
     SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled = 0, totp_enabled_at = NULL
     WHERE id = ?`
  )
    .bind(userId)
    .run();
  await env.DB.prepare("DELETE FROM twofa_backup_codes WHERE user_id = ?").bind(userId).run();
  await env.DB.prepare("DELETE FROM twofa_challenges WHERE user_id = ?").bind(userId).run();
}

export async function createTwoFactorChallenge(env, userId) {
  const rawToken = generateRawToken(32);
  const challengeHash = await hashSecret("2fa:" + rawToken, env);
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000).toISOString();

  await env.DB.prepare("DELETE FROM twofa_challenges WHERE user_id = ?").bind(userId).run();
  await env.DB.prepare(
    "INSERT INTO twofa_challenges (challenge_hash, user_id, expires_at) VALUES (?, ?, ?)"
  )
    .bind(challengeHash, userId, expiresAt)
    .run();

  return { challenge: rawToken, expiresIn: CHALLENGE_MINUTES * 60 };
}

async function loadChallengeUser(env, rawChallenge) {
  const challengeHash = await hashSecret("2fa:" + rawChallenge, env);
  return env.DB.prepare(
    `SELECT c.user_id, u.email, u.display_name, u.email_verified, u.totp_secret, u.totp_enabled,
            ua.updated_at AS avatar_updated_at,
            CASE WHEN ua.user_id IS NULL THEN 0 ELSE 1 END AS has_avatar
     FROM twofa_challenges c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN user_avatars ua ON ua.user_id = u.id
     WHERE c.challenge_hash = ?
       AND c.expires_at > datetime('now')
       AND u.totp_enabled = 1`
  )
    .bind(challengeHash)
    .first();
}

async function consumeBackupCode(env, userId, code) {
  const normalized = normalizeBackupCode(code);
  if (normalized.length < 8) {
    return false;
  }

  const codeHash = await hashSecret("backup:" + normalized, env);
  const row = await env.DB.prepare(
    `SELECT id FROM twofa_backup_codes
     WHERE user_id = ? AND code_hash = ? AND used_at IS NULL`
  )
    .bind(userId, codeHash)
    .first();

  if (!row) {
    return false;
  }

  await env.DB.prepare(
    "UPDATE twofa_backup_codes SET used_at = datetime('now') WHERE id = ?"
  )
    .bind(row.id)
    .run();
  return true;
}

export async function verifyTwoFactorLogin(env, rawChallenge, code, backupCode) {
  const row = await loadChallengeUser(env, rawChallenge);
  if (!row) {
    throw new Error("Two-factor challenge expired. Sign in again.");
  }

  let verified = false;

  if (backupCode) {
    verified = await consumeBackupCode(env, row.user_id, backupCode);
  } else {
    const secret = await decryptTotpSecret(row.totp_secret, env);
    if (!secret) {
      throw new Error("Two-factor authentication is misconfigured.");
    }
    verified = await verifyTotpCode(secret, code);
  }

  if (!verified) {
    throw new Error("Invalid authenticator or backup code.");
  }

  const challengeHash = await hashSecret("2fa:" + rawChallenge, env);
  await env.DB.prepare("DELETE FROM twofa_challenges WHERE challenge_hash = ?")
    .bind(challengeHash)
    .run();

  return row;
}

export function twoFactorStatusFromUser(user) {
  return {
    enabled: Boolean(user && user.totp_enabled),
    enabledAt: user && user.totp_enabled_at ? user.totp_enabled_at : null,
  };
}
