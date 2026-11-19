const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function bytesToBase32(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";

  bytes.forEach(function (byte) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  });

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32ToBytes(input) {
  const cleaned = String(input || "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const output = [];

  for (let i = 0; i < cleaned.length; i += 1) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

function normalizeCode(code) {
  return String(code || "").replace(/\s+/g, "");
}

async function hmacSha1(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, message);
  return new Uint8Array(signature);
}

function dynamicTruncate(hmac) {
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return binary % 1000000;
}

export function generateTotpSecret(byteLength = 20) {
  return bytesToBase32(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function buildOtpAuthUri(email, secret, issuer) {
  const label = encodeURIComponent(issuer + ":" + email);
  const params = new URLSearchParams({
    secret: secret,
    issuer: issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return "otpauth://totp/" + label + "?" + params.toString();
}

export async function generateTotpCode(secret, timestampMs = Date.now()) {
  const keyBytes = base32ToBytes(secret);
  const counter = Math.floor(timestampMs / 1000 / 30);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);

  const hmac = await hmacSha1(keyBytes, new Uint8Array(buffer));
  const otp = dynamicTruncate(hmac);
  return String(otp).padStart(6, "0");
}

// The 30-second time step a code belongs to, or null when it matches none
// inside the window. Callers use the step to refuse a replayed code.
export async function findTotpStep(secret, code, options = {}) {
  const normalized = normalizeCode(code);
  if (!/^\d{6}$/.test(normalized)) {
    return null;
  }

  const window = Number.isFinite(options.window) ? options.window : 1;
  const now = options.timestampMs || Date.now();
  const currentStep = Math.floor(now / 1000 / 30);
  let found = null;

  // Every candidate is checked (no early exit) so timing doesn't reveal which
  // step matched.
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = await generateTotpCode(secret, now + offset * 30 * 1000);
    if (candidate === normalized && found === null) {
      found = currentStep + offset;
    }
  }

  return found;
}

export async function verifyTotpCode(secret, code, options = {}) {
  return (await findTotpStep(secret, code, options)) !== null;
}

// Authenticator secrets are stored encrypted (AES-GCM, key derived from
// SESSION_SECRET) so a copy of the database alone can't produce codes. With no
// SESSION_SECRET configured they're stored with a "plain:" prefix instead,
// matching how hashSecret() degrades.
async function sealKey(env) {
  const material = env && env.SESSION_SECRET;
  if (!material) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("kanasaka-totp-seal:" + material)
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes) {
  let binary = "";
  bytes.forEach(function (byte) {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function sealSecret(secret, env) {
  const key = await sealKey(env);
  if (!key) return "plain:" + secret;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(secret)
  );
  return "v1:" + toBase64(iv) + ":" + toBase64(new Uint8Array(cipher));
}

export async function openSecret(stored, env) {
  const value = String(stored || "");
  if (value.startsWith("plain:")) return value.slice(6);
  if (!value.startsWith("v1:")) return null;
  const key = await sealKey(env);
  if (!key) return null;
  const parts = value.split(":");
  if (parts.length !== 3) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(parts[1]) },
      key,
      fromBase64(parts[2])
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const chunk = Array.from(bytes, function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
    codes.push(chunk.slice(0, 4) + "-" + chunk.slice(4, 8) + "-" + chunk.slice(8, 10));
  }
  return codes;
}

export function normalizeBackupCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
