export function normalizePhone(value) {
  let raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  raw = raw.replace(/[\s().-]/g, "");

  if (raw.startsWith("00")) {
    raw = "+" + raw.slice(2);
  }

  if (!raw.startsWith("+")) {
    if (raw.startsWith("0")) {
      raw = "+49" + raw.slice(1);
    } else {
      raw = "+" + raw;
    }
  }

  const digits = raw.slice(1);
  if (!/^\d{8,15}$/.test(digits)) {
    return null;
  }

  return "+" + digits;
}

export function maskPhone(e164) {
  const phone = String(e164 || "");
  if (phone.length < 6) {
    return "your phone";
  }

  return phone.slice(0, 3) + " **** " + phone.slice(-4);
}
