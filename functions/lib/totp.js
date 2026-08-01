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

export async function verifyTotpCode(secret, code, options = {}) {
  const normalized = normalizeCode(code);
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  const window = Number.isFinite(options.window) ? options.window : 1;
  const now = options.timestampMs || Date.now();

  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = await generateTotpCode(secret, now + offset * 30 * 1000);
    if (candidate === normalized) {
      return true;
    }
  }

  return false;
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
