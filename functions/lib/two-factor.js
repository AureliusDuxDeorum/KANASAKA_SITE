import { maskPhone, normalizePhone } from "./phone.js";
import { sendVerificationSms } from "./sms.js";
import { sendTwoFactorCodeEmail } from "./email.js";
import { generateRawToken, hashSecret } from "./tokens.js";
import { twofaChallengesHaveRememberColumn, usersHaveTwofaEmailColumn } from "./schema.js";
import { logEvent, tooManyRecentEvents } from "./throttle.js";
import {
  buildOtpAuthUri,
  findTotpStep,
  generateTotpSecret,
  openSecret,
  sealSecret,
} from "./totp.js";

function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) return email || "";
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

const OTP_MINUTES = 5;
const CHALLENGE_MINUTES = 5;

// A 6-digit code has only a million possibilities, so guessing has to be
// capped: after OTP_MAX_FAILURES wrong codes inside the code's own lifetime
// every outstanding code and login challenge for the account is destroyed
// (a fresh password login is needed), and further attempts are refused until
// the window passes. Counted per account, across login/setup/disable.
export const OTP_MAX_FAILURES = 5;
export const TOO_MANY_CODES_MESSAGE = "Too many incorrect codes. Request a new code in a few minutes.";

function tooManyAttemptsError(userId) {
  const err = new Error(TOO_MANY_CODES_MESSAGE);
  err.status = 429;
  err.userId = userId;
  return err;
}

async function otpLockedOut(env, userId) {
  return tooManyRecentEvents(env, "otp_failed", "userId", userId, {
    max: OTP_MAX_FAILURES,
    windowMinutes: OTP_MINUTES,
  });
}

async function recordOtpFailure(env, userId, purpose) {
  await logEvent(env, "otp_failed", { userId, purpose });
  if (await otpLockedOut(env, userId)) {
    await env.DB.prepare("DELETE FROM sms_otp_codes WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM twofa_challenges WHERE user_id = ?").bind(userId).run();
  }
}

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
  if (await otpLockedOut(env, userId)) {
    throw tooManyAttemptsError(userId);
  }

  const normalized = normalizeSmsCode(code);
  if (!/^\d{6}$/.test(normalized)) {
    await recordOtpFailure(env, userId, purpose);
    return false;
  }

  const codeHash = await hashSecret("sms:" + purpose + ":" + normalized, env);
  const row = await env.DB.prepare(
    `SELECT id FROM sms_otp_codes
     WHERE user_id = ? AND purpose = ? AND code_hash = ?
       AND datetime(expires_at) > datetime('now')`
  )
    .bind(userId, purpose, codeHash)
    .first();

  if (!row) {
    await recordOtpFailure(env, userId, purpose);
    return false;
  }

  await env.DB.prepare("DELETE FROM sms_otp_codes WHERE id = ?").bind(row.id).run();
  return true;
}

const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const BACKUP_CODE_COUNT = 8;

function generateBackupCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let raw = "";
  for (let i = 0; i < bytes.length; i += 1) {
    raw += BACKUP_CODE_ALPHABET[bytes[i] % BACKUP_CODE_ALPHABET.length];
  }
  return raw.slice(0, 5) + "-" + raw.slice(5);
}

function normalizeBackupCode(code) {
  return String(code || "").trim().toUpperCase();
}

// One-time recovery codes for when the account can't receive the normal
// login code (e.g. no access to the 2FA email inbox). Replaces any
// previously issued set -- codes are shown to the user exactly once, right
// after generation, so old ones are useless once new ones are issued anyway.
export async function generateBackupCodes(env, userId) {
  await env.DB.prepare("DELETE FROM twofa_backup_codes WHERE user_id = ?").bind(userId).run();

  const codes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i += 1) {
    const raw = generateBackupCode();
    const hash = await hashSecret("backup:" + raw, env);
    await env.DB.prepare("INSERT INTO twofa_backup_codes (user_id, code_hash) VALUES (?, ?)")
      .bind(userId, hash)
      .run();
    codes.push(raw);
  }

  return codes;
}

async function verifyBackupCode(env, userId, rawCode) {
  const normalized = normalizeBackupCode(rawCode);
  if (!normalized) return false;

  const hash = await hashSecret("backup:" + normalized, env);
  const row = await env.DB.prepare(
    "SELECT id FROM twofa_backup_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL"
  )
    .bind(userId, hash)
    .first();

  if (!row) {
    await recordOtpFailure(env, userId, "backup");
    return false;
  }

  await env.DB.prepare("UPDATE twofa_backup_codes SET used_at = datetime('now') WHERE id = ?")
    .bind(row.id)
    .run();
  return true;
}

export async function countUnusedBackupCodes(env, userId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM twofa_backup_codes WHERE user_id = ? AND used_at IS NULL"
  )
    .bind(userId)
    .first();
  return row ? Number(row.c) : 0;
}

// An account can have several second factors at once (email codes and an
// authenticator app); at sign-in the user picks one. "sms" is the legacy
// text-message method and stays exclusive.
//
// Rows that go through twoFactorMethodsFromUser need these columns, which the
// callers select with `await twoFactorColumns(env, "u")`: phone_e164,
// has_totp_secret (the secret itself never leaves this module) and email_2fa.
// Before migration 020 there is no email flag, so email is inferred the old
// way (enabled, with no phone and no authenticator).
export async function twoFactorColumns(env, alias = "u") {
  const a = alias ? alias + "." : "";
  const flag = (await usersHaveTwofaEmailColumn(env))
    ? a + "twofa_email_enabled"
    : `CASE WHEN ${a}totp_enabled = 1 AND ${a}totp_secret IS NULL AND ${a}phone_e164 IS NULL THEN 1 ELSE 0 END`;
  return `${a}phone_e164, CASE WHEN ${a}totp_secret IS NULL THEN 0 ELSE 1 END AS has_totp_secret, ${flag} AS email_2fa`;
}

export function twoFactorMethodsFromUser(user) {
  if (!user || !user.totp_enabled) return [];
  const methods = [];
  if (user.has_totp_secret) methods.push("totp");
  if (user.phone_e164) methods.push("sms");
  else if (user.email_2fa) methods.push("email");
  // Enabled but nothing recorded: the pre-multi-method meaning, email.
  return methods.length ? methods : ["email"];
}

export const TOTP_ISSUER = "KANASAKA";
export const TOTP_REPLAYED_MESSAGE = "That code was already used. Wait for the next one from your app.";

// Checks a code from the user's authenticator app against a stored (sealed)
// secret. Counts toward the same per-account lockout as every other code, and
// refuses a code whose 30-second step was already accepted so an observed code
// can't be replayed inside its validity window.
async function verifyTotpCodeFor(env, userId, sealed, code, purpose, { countFailure = true } = {}) {
  if (await otpLockedOut(env, userId)) {
    throw tooManyAttemptsError(userId);
  }

  const secret = await openSecret(sealed, env);
  const step = secret ? await findTotpStep(secret, normalizeSmsCode(code)) : null;
  if (step === null) {
    // With countFailure off the caller still has another method to try for
    // this same entry and records the (single) failure itself.
    if (countFailure) await recordOtpFailure(env, userId, purpose);
    return false;
  }

  const usedType = "totp_used_" + step;
  if (await tooManyRecentEvents(env, usedType, "userId", userId, { max: 1, windowMinutes: 5 })) {
    throw new Error(TOTP_REPLAYED_MESSAGE);
  }
  await logEvent(env, usedType, { userId });
  return true;
}

// A 6-digit entry is an authenticator code; anything else can only be a backup
// code. Routing on the format means one entry is one guess, not two.
async function verifyTotpOrBackup(env, userId, sealed, code, purpose) {
  if (/^\d{6}$/.test(normalizeSmsCode(code))) {
    return verifyTotpCodeFor(env, userId, sealed, code, purpose);
  }
  if (await otpLockedOut(env, userId)) {
    throw tooManyAttemptsError(userId);
  }
  return verifyBackupCode(env, userId, code);
}

async function loadMethodState(env, userId) {
  const row = await env.DB.prepare(
    `SELECT u.email, u.totp_enabled, ${await twoFactorColumns(env, "u")} FROM users u WHERE u.id = ?`
  )
    .bind(userId)
    .first();
  if (!row) throw new Error("Account not found.");
  return { row, methods: twoFactorMethodsFromUser(row) };
}

// Adding an authenticator starts with a code emailed to the account address,
// unless email codes are already one of the account's methods (the address is
// then already proven). Sent by /totp-email-code.
export async function sendTotpSetupEmailCode(env, userId) {
  const { row, methods } = await loadMethodState(env, userId);
  if (methods.includes("totp")) throw new Error("Authenticator app is already set up.");
  if (methods.includes("email")) throw new Error("No email confirmation is needed.");
  if (methods.includes("sms")) throw new Error("Turn off text-message two-factor first.");

  const code = generateSmsCode();
  await storeSmsOtp(env, userId, "totp_setup", code);
  await sendTwoFactorCodeEmail(env, row.email, code, "setup");
  return { emailMasked: maskEmail(row.email) };
}

export async function beginTotpSetup(env, userId, emailCode) {
  const { row, methods } = await loadMethodState(env, userId);

  if (methods.includes("totp")) {
    throw new Error("Authenticator app is already set up.");
  }
  if (methods.includes("sms")) {
    throw new Error("Turn off text-message two-factor first.");
  }
  if (methods.includes("email") && !(await usersHaveTwofaEmailColumn(env))) {
    throw new Error("Using email and an authenticator together isn't available yet.");
  }

  if (!methods.includes("email")) {
    if (!(await verifySmsOtp(env, userId, "totp_setup", emailCode))) {
      const err = new Error("Invalid or expired confirmation code.");
      err.needsEmailCode = true;
      throw err;
    }
  }

  const secret = generateTotpSecret();
  await env.DB.prepare("UPDATE users SET totp_pending_secret = ? WHERE id = ?")
    .bind(await sealSecret(secret, env), userId)
    .run();

  return {
    secret,
    otpauthUri: buildOtpAuthUri(row.email, secret, TOTP_ISSUER),
  };
}

async function hasBackupCodes(env, userId) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM twofa_backup_codes WHERE user_id = ?")
    .bind(userId)
    .first();
  return Boolean(row && Number(row.c) > 0);
}

export async function enableTotp2fa(env, userId, code) {
  const row = await env.DB.prepare("SELECT totp_pending_secret, totp_secret FROM users WHERE id = ?")
    .bind(userId)
    .first();

  if (!row || !row.totp_pending_secret) {
    throw new Error("Start the authenticator setup first.");
  }

  if (row.totp_secret) {
    throw new Error("Authenticator app is already set up.");
  }

  const valid = await verifyTotpCodeFor(env, userId, row.totp_pending_secret, code, "totp_setup");
  if (!valid) {
    throw new Error("Invalid code. Check the 6 digits in your authenticator app and try again.");
  }

  await env.DB.prepare(
    `UPDATE users
     SET totp_secret = totp_pending_secret, totp_pending_secret = NULL,
         totp_enabled = 1, totp_enabled_at = COALESCE(totp_enabled_at, datetime('now'))
     WHERE id = ?`
  )
    .bind(userId)
    .run();

  // Backup codes belong to the account, not a method: issue them when 2FA
  // first turns on, keep the existing set when a second method is added.
  const backupCodes = (await hasBackupCodes(env, userId)) ? null : await generateBackupCodes(env, userId);
  return { backupCodes };
}

// Removes one second factor. Needs a current code of that method (or a backup
// code). Removing the last one switches two-factor off altogether.
export async function removeTwoFactorMethod(env, userId, method, code) {
  const { methods } = await loadMethodState(env, userId);
  if (!methods.includes(method)) {
    throw new Error("That method is not enabled.");
  }

  const six = /^\d{6}$/.test(normalizeSmsCode(code));
  let valid;
  if (method === "totp") {
    const row = await env.DB.prepare("SELECT totp_secret FROM users WHERE id = ?").bind(userId).first();
    valid = await verifyTotpOrBackup(env, userId, row && row.totp_secret, code, "remove_totp");
  } else if (six) {
    valid = await verifySmsOtp(env, userId, "disable", code);
  } else {
    if (await otpLockedOut(env, userId)) throw tooManyAttemptsError(userId);
    valid = await verifyBackupCode(env, userId, code);
  }
  if (!valid) {
    throw new Error(
      method === "totp"
        ? "Invalid code. Enter a code from your authenticator app, or a backup code."
        : "Invalid or expired verification code."
    );
  }

  const remaining = methods.filter(function (m) {
    return m !== method;
  });

  if (method === "totp") {
    await env.DB.prepare("UPDATE users SET totp_secret = NULL, totp_pending_secret = NULL WHERE id = ?")
      .bind(userId)
      .run();
  } else if (method === "sms") {
    await env.DB.prepare("UPDATE users SET phone_e164 = NULL, phone_pending_e164 = NULL WHERE id = ?")
      .bind(userId)
      .run();
  } else if (await usersHaveTwofaEmailColumn(env)) {
    await env.DB.prepare("UPDATE users SET twofa_email_enabled = 0 WHERE id = ?").bind(userId).run();
  }

  await env.DB.prepare("DELETE FROM sms_otp_codes WHERE user_id = ?").bind(userId).run();
  await env.DB.prepare("DELETE FROM twofa_challenges WHERE user_id = ?").bind(userId).run();

  if (!remaining.length) {
    await env.DB.prepare("UPDATE users SET totp_enabled = 0, totp_enabled_at = NULL WHERE id = ?")
      .bind(userId)
      .run();
    await env.DB.prepare("DELETE FROM twofa_backup_codes WHERE user_id = ?").bind(userId).run();
  }

  return { remaining };
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

export async function beginEmailSetup(env, userId) {
  const { row, methods } = await loadMethodState(env, userId);

  if (methods.includes("email") || methods.includes("sms")) {
    throw new Error("Email codes are already set up.");
  }
  if (methods.length && !(await usersHaveTwofaEmailColumn(env))) {
    throw new Error("Using email and an authenticator together isn't available yet.");
  }

  const code = generateSmsCode();
  await storeSmsOtp(env, userId, "email_setup", code);
  await sendTwoFactorCodeEmail(env, row.email, code, "setup");

  return {
    emailMasked: maskEmail(row.email),
  };
}

export async function enableEmail2fa(env, userId, code) {
  const { row, methods } = await loadMethodState(env, userId);

  if (methods.includes("email") || methods.includes("sms")) {
    throw new Error("Email codes are already set up.");
  }

  const valid = await verifySmsOtp(env, userId, "email_setup", code);
  if (!valid) {
    throw new Error("Invalid or expired verification code.");
  }

  if (await usersHaveTwofaEmailColumn(env)) {
    await env.DB.prepare(
      `UPDATE users
       SET twofa_email_enabled = 1, totp_enabled = 1,
           totp_enabled_at = COALESCE(totp_enabled_at, datetime('now'))
       WHERE id = ?`
    )
      .bind(userId)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE users SET totp_enabled = 1, totp_enabled_at = datetime('now') WHERE id = ?`
    )
      .bind(userId)
      .run();
  }

  const backupCodes = (await hasBackupCodes(env, userId)) ? null : await generateBackupCodes(env, userId);

  return {
    emailMasked: maskEmail(row.email),
    backupCodes,
  };
}

export async function sendDisableEmailCode(env, userId) {
  const { row, methods } = await loadMethodState(env, userId);

  if (!methods.includes("email")) {
    throw new Error("Email codes are not enabled.");
  }

  const code = generateSmsCode();
  await storeSmsOtp(env, userId, "disable", code);
  await sendTwoFactorCodeEmail(env, row.email, code, "disable");

  return {
    emailMasked: maskEmail(row.email),
  };
}

export async function sendLoginEmailCode(env, userId) {
  const { row, methods } = await loadMethodState(env, userId);

  if (!methods.includes("email")) {
    throw new Error("Two-factor authentication is misconfigured.");
  }

  const code = generateSmsCode();
  await storeSmsOtp(env, userId, "login", code);
  await sendTwoFactorCodeEmail(env, row.email, code, "login");

  return {
    emailMasked: maskEmail(row.email),
  };
}

// The method a sign-in expects first: the authenticator when there is one,
// otherwise the one code that gets sent. null when two-factor is off.
export function twoFactorMethodFromUser(user) {
  return twoFactorMethodsFromUser(user)[0] || null;
}

export async function createTwoFactorChallenge(env, userId, remember = true) {
  const rawToken = generateRawToken(32);
  const challengeHash = await hashSecret("2fa:" + rawToken, env);
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000).toISOString();

  await env.DB.prepare("DELETE FROM twofa_challenges WHERE user_id = ?").bind(userId).run();

  if (await twofaChallengesHaveRememberColumn(env)) {
    await env.DB.prepare(
      "INSERT INTO twofa_challenges (challenge_hash, user_id, expires_at, remember) VALUES (?, ?, ?, ?)"
    )
      .bind(challengeHash, userId, expiresAt, remember ? 1 : 0)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO twofa_challenges (challenge_hash, user_id, expires_at) VALUES (?, ?, ?)"
    )
      .bind(challengeHash, userId, expiresAt)
      .run();
  }

  const user = await env.DB.prepare(
    `SELECT u.totp_enabled, ${await twoFactorColumns(env, "u")} FROM users u WHERE u.id = ?`
  )
    .bind(userId)
    .first();
  const methods = twoFactorMethodsFromUser(user);
  const method = methods[0] || "email";

  // A code is sent on its own only when it's the account's single method. With
  // an authenticator the user may prefer it, so an emailed code is sent only
  // if they ask (sendLoginCodeForChallenge).
  if (methods.length === 1 && method === "sms") {
    await sendLoginSmsCode(env, userId);
  } else if (methods.length === 1 && method === "email") {
    await sendLoginEmailCode(env, userId);
  }

  return { challenge: rawToken, expiresIn: CHALLENGE_MINUTES * 60, method, methods };
}

// "Email me a code instead", from the sign-in screen of an account that has
// both an authenticator and email codes.
export async function sendLoginCodeForChallenge(env, rawChallenge, allow) {
  const row = await loadChallengeUser(env, rawChallenge);
  if (!row) {
    throw new Error("Two-factor challenge expired. Sign in again.");
  }

  const methods = twoFactorMethodsFromUser(row);
  if (!methods.includes("email")) {
    throw new Error("Email codes are not enabled for this account.");
  }

  // `allow(userId)` is the caller's per-account send throttle; it runs before
  // anything is emailed.
  if (allow && !(await allow(row.user_id))) {
    const err = new Error("Too many codes requested. Try again in a few minutes.");
    err.status = 429;
    throw err;
  }

  return sendLoginEmailCode(env, row.user_id);
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
  const rememberSelect = (await twofaChallengesHaveRememberColumn(env))
    ? ", c.remember"
    : "";
  const row = await env.DB.prepare(
    `SELECT c.user_id, u.email, u.display_name, u.email_verified, u.totp_enabled, u.totp_secret,
            ${await twoFactorColumns(env, "u")},
            ua.updated_at AS avatar_updated_at,
            CASE WHEN ua.user_id IS NULL THEN 0 ELSE 1 END AS has_avatar
            ${rememberSelect}
     FROM twofa_challenges c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN user_avatars ua ON ua.user_id = u.id
     WHERE c.challenge_hash = ?
       AND datetime(c.expires_at) > datetime('now')
       AND u.totp_enabled = 1`
  )
    .bind(challengeHash)
    .first();

  if (row) {
    // The sealed secret stays inside this module.
    row.has_totp_secret = row.totp_secret ? 1 : 0;
  }

  if (row && row.remember == null) {
    row.remember = true;
  } else if (row) {
    row.remember = Boolean(row.remember);
  }

  return row;
}

export async function verifyTwoFactorLogin(env, rawChallenge, code) {
  const row = await loadChallengeUser(env, rawChallenge);
  if (!row) {
    throw new Error("Two-factor challenge expired. Sign in again.");
  }

  let verified = false;
  try {
    // 6 digits is an authenticator/emailed/texted code; anything else can only
    // be a backup code. Routing on the format means one entry is one guess,
    // not two.
    const sixDigits = /^\d{6}$/.test(normalizeSmsCode(code));
    const hasSentCode = twoFactorMethodsFromUser(row).some(function (m) {
      return m === "email" || m === "sms";
    });
    if (sixDigits && row.totp_secret) {
      // Either the app's code or (if the user asked for one) the emailed code;
      // the entry counts as one failure only if neither matches.
      verified = await verifyTotpCodeFor(env, row.user_id, row.totp_secret, code, "login", {
        countFailure: !hasSentCode,
      });
      if (!verified && hasSentCode) {
        verified = await verifySmsOtp(env, row.user_id, "login", code);
      }
    } else if (sixDigits) {
      verified = await verifySmsOtp(env, row.user_id, "login", code);
    } else {
      if (await otpLockedOut(env, row.user_id)) {
        throw tooManyAttemptsError(row.user_id);
      }
      verified = await verifyBackupCode(env, row.user_id, code);
    }
  } catch (err) {
    err.userEmail = row.email;
    err.userId = row.user_id;
    throw err;
  }

  if (!verified) {
    const err = new Error("Invalid or expired verification code.");
    err.userEmail = row.email;
    err.userId = row.user_id;
    throw err;
  }

  const challengeHash = await hashSecret("2fa:" + rawChallenge, env);
  await env.DB.prepare("DELETE FROM twofa_challenges WHERE challenge_hash = ?")
    .bind(challengeHash)
    .run();

  delete row.totp_secret;
  return row;
}

export function twoFactorStatusFromUser(user) {
  const methods = twoFactorMethodsFromUser(user);
  return {
    enabled: methods.length > 0,
    method: methods[0] || null,
    methods,
    enabledAt: user && user.totp_enabled_at ? user.totp_enabled_at : null,
    phoneMasked: user && user.phone_e164 ? maskPhone(user.phone_e164) : null,
    emailMasked: methods.includes("email") ? maskEmail(user.email) : null,
  };
}

export { maskPhone, maskEmail };
