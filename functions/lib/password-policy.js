export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const LOWER_RE = /[a-z]/;
const UPPER_RE = /[A-Z]/;
const DIGIT_RE = /[0-9]/;
const SPECIAL_RE = /[!-\/:-@[-`{-~]/;
const WHITESPACE_RE = /\s/;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "123456789",
  "1234567890",
  "12345678910",
  "123456789101",
  "qwerty123",
  "qwertyuiop",
  "letmein",
  "welcome",
  "welcome1",
  "welcome123",
  "admin123",
  "changeme",
  "kanasaka",
  "kanasaka123",
  "ksunify",
  "iloveyou",
  "sunshine",
  "football",
  "baseball",
  "monkey",
  "dragon",
  "master",
  "login123",
  "passw0rd",
  "trustno1",
  "superman",
  "batman",
  "shadow",
  "hello123",
  "charlie",
  "mustang",
  "abc123",
  "abc123456789",
  "111111111111",
  "000000000000",
  "123123123123",
  "654321654321",
  "qwerty123456",
  "asdfghjkl123",
  "zxcvbnm12345",
]);

export function passwordPolicyRules() {
  return [
    { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters` },
    { id: "upper", label: "One uppercase letter (A-Z)" },
    { id: "lower", label: "One lowercase letter (a-z)" },
    { id: "digit", label: "One number (0-9)" },
    { id: "special", label: "One special character (!@#$...)" },
    { id: "noSpace", label: "No spaces" },
    { id: "noRepeat", label: "No more than 2 identical characters in a row" },
    { id: "notCommon", label: "Not a commonly used password" },
    { id: "notEmail", label: "Must not contain your email username" },
  ];
}

function emailLocalPart(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const at = normalized.indexOf("@");
  if (at <= 0) {
    return "";
  }
  return normalized.slice(0, at);
}

function hasTripleRepeat(password) {
  for (let i = 0; i < password.length - 2; i += 1) {
    if (password[i] === password[i + 1] && password[i] === password[i + 2]) {
      return true;
    }
  }
  return false;
}

export function evaluatePasswordPolicy(password, context = {}) {
  const value = typeof password === "string" ? password : "";
  const emailPart = emailLocalPart(context.email);
  const lowered = value.toLowerCase();

  return {
    length: value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH,
    upper: UPPER_RE.test(value),
    lower: LOWER_RE.test(value),
    digit: DIGIT_RE.test(value),
    special: SPECIAL_RE.test(value),
    noSpace: value.length > 0 && !WHITESPACE_RE.test(value),
    noRepeat: value.length > 0 && !hasTripleRepeat(value),
    notCommon: value.length > 0 && !COMMON_PASSWORDS.has(lowered),
    notEmail:
      !emailPart || emailPart.length < 3 || !lowered.includes(emailPart),
  };
}

export function passwordPolicyError(password, context = {}) {
  if (typeof password !== "string") {
    return "Enter a valid password.";
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }

  const checks = evaluatePasswordPolicy(password, context);

  if (!checks.length) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!checks.upper) {
    return "Password must include at least one uppercase letter.";
  }
  if (!checks.lower) {
    return "Password must include at least one lowercase letter.";
  }
  if (!checks.digit) {
    return "Password must include at least one number.";
  }
  if (!checks.special) {
    return "Password must include at least one special character.";
  }
  if (!checks.noSpace) {
    return "Password must not contain spaces.";
  }
  if (!checks.noRepeat) {
    return "Password must not repeat the same character more than twice in a row.";
  }
  if (!checks.notCommon) {
    return "That password is too common. Choose something harder to guess.";
  }
  if (!checks.notEmail) {
    return "Password must not contain your email username.";
  }

  return null;
}

export function loginPasswordValidationError(password) {
  if (typeof password !== "string" || !password) {
    return "Enter your password.";
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }

  return null;
}
