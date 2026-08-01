import { maskPhone, normalizePhone } from "./phone.js";
import { sendVerificationSms } from "./sms.js";
import { generateRawToken, hashSecret } from "./tokens.js";

const OTP_MINUTES = 5;
const CHALLENGE_MINUTES = 5;

function normalizeSmsCode(code) {
  return String(code || "").replace(/\s+/g, "");
}

function generateSmsCode() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(value).padStart(6, "0");
}

async function storeSmsOtp(env, userId, purpose, code) {
  const codeHash = await hashSecret("sms:" + purpose + ":" + normalizeSmsCode(code), env);
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000).toISOString();

  await env.DB.prepare("DELETE FROM sms_otp_codes WHERE user_id = ? AND purpose = ?")
    .bind(userId, purpose)
    .run();

  await env.DB.prepare(
    "INSERT INTO sms_otp_codes (user_id, purpose, code_hash, expires_at) VALUES (?, ?, ?, ?)"
  )
    .bind(userId, purpose, codeHash, expiresAt)
    .run();
}

async function verifySmsOtp(env, userId, purpose, code) {
  const normalized = normalizeSmsCode(code);
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  const codeHash = await hashSecret("sms:" + purpose + ":" + normalized, env);
  const row = await env.DB.prepare(
    `SELECT id FROM sms_otp_codes
     WHERE user_id = ? AND purpose = ? AND code_hash = ?
       AND expires_at > datetime('now')`
  )
    .bind(userId, purpose, codeHash)
    .first();

  if (!row) {
    return false;
  }

  await env.DB.prepare("DELETE FROM sms_otp_codes WHERE id = ?").bind(row.id).run();
  return true;
}

export async function beginSmsSetup(env, userId, phoneInput) {
  const phone = normalizePhone(phoneInput);
  if (!phone) {
    throw new Error("Enter a valid phone number with country code (e.g. +49 1522 3693645).");
  }

  const code = generateSmsCode();
  await env.DB.prepare("UPDATE users SET phone_pending_e164 = ? WHERE id = ?")
    .bind(phone, userId)
    .run();
  await storeSmsOtp(env, userId, "setup", code);
  await sendVerificationSms(env, phone, code);

  return {
    phoneMasked: maskPhone(phone),
  };
}

export async function resendSmsSetup(env, userId) {
  const row = await env.DB.prepare(
    "SELECT phone_pending_e164 FROM users WHERE id = ? AND totp_enabled = 0"
  )
    .bind(userId)
    .first();

  if (!row || !row.phone_pending_e164) {
    throw new Error("Enter your phone number and request a code first.");
  }

  const code = generateSmsCode();
  await storeSmsOtp(env, userId, "setup", code);
  await sendVerificationSms(env, row.phone_pending_e164, code);

  return {
    phoneMasked: maskPhone(row.phone_pending_e164),
  };
}

export async function enableSms2fa(env, userId, code) {
  const row = await env.DB.prepare(
    "SELECT phone_pending_e164, totp_enabled FROM users WHERE id = ?"
  )
    .bind(userId)
    .first();

  if (!row || !row.phone_pending_e164) {
    throw new Error("Request a verification code first.");
  }

  if (row.totp_enabled) {
    throw new Error("Two-factor authentication is already enabled.");
  }

  const valid = await verifySmsOtp(env, userId, "setup", code);
  if (!valid) {
    throw new Error("Invalid or expired verification code.");
  }

  await env.DB.prepare(
    `UPDATE users
     SET phone_e164 = ?, phone_pending_e164 = NULL, totp_enabled = 1,
         totp_secret = NULL, totp_pending_secret = NULL,
         totp_enabled_at = datetime('now')
     WHERE id = ?`
  )
    .bind(row.phone_pending_e164, userId)
    .run();

  await env.DB.prepare("DELETE FROM twofa_backup_codes WHERE user_id = ?").bind(userId).run();

  return {
    phoneMasked: maskPhone(row.phone_pending_e164),
  };
}

export async function sendDisableSmsCode(env, userId) {
  const row = await env.DB.prepare(
    "SELECT phone_e164 FROM users WHERE id = ? AND totp_enabled = 1"
  )
    .bind(userId)
    .first();

  if (!row || !row.phone_e164) {
    throw new Error("Two-factor authentication is not enabled.");
  }

  const code = generateSmsCode();
  await storeSmsOtp(env, userId, "disable", code);
  await sendVerificationSms(env, row.phone_e164, code);

  return {
    phoneMasked: maskPhone(row.phone_e164),
  };
}

export async function disableSms2fa(env, userId, code) {
  const valid = await verifySmsOtp(env, userId, "disable", code);
  if (!valid) {
    throw new Error("Invalid or expired verification code.");
  }

  await env.DB.prepare(
    `UPDATE users
     SET phone_e164 = NULL, phone_pending_e164 = NULL, totp_enabled = 0,
         totp_secret = NULL, totp_pending_secret = NULL, totp_enabled_at = NULL
     WHERE id = ?`
  )
    .bind(userId)
    .run();

  await env.DB.prepare("DELETE FROM sms_otp_codes WHERE user_id = ?").bind(userId).run();
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

  await sendLoginSmsCode(env, userId);

  return { challenge: rawToken, expiresIn: CHALLENGE_MINUTES * 60 };
}

export async function sendLoginSmsCode(env, userId) {
  const row = await env.DB.prepare(
    "SELECT phone_e164 FROM users WHERE id = ? AND totp_enabled = 1"
  )
    .bind(userId)
    .first();

  if (!row || !row.phone_e164) {
    throw new Error("Two-factor authentication is misconfigured.");
  }

  const code = generateSmsCode();
  await storeSmsOtp(env, userId, "login", code);
  await sendVerificationSms(env, row.phone_e164, code);

  return {
    phoneMasked: maskPhone(row.phone_e164),
  };
}

async function loadChallengeUser(env, rawChallenge) {
  const challengeHash = await hashSecret("2fa:" + rawChallenge, env);
  return env.DB.prepare(
    `SELECT c.user_id, u.email, u.display_name, u.email_verified, u.phone_e164, u.totp_enabled,
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

export async function verifyTwoFactorLogin(env, rawChallenge, code) {
  const row = await loadChallengeUser(env, rawChallenge);
  if (!row) {
    throw new Error("Two-factor challenge expired. Sign in again.");
  }

  const verified = await verifySmsOtp(env, row.user_id, "login", code);
  if (!verified) {
    throw new Error("Invalid or expired verification code.");
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
    phoneMasked: user && user.phone_e164 ? maskPhone(user.phone_e164) : null,
  };
}

export { maskPhone };
