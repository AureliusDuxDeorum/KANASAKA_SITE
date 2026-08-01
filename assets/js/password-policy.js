(function (global) {
  "use strict";

  // Keep in sync with functions/lib/password-policy.js
  var PASSWORD_MIN_LENGTH = 12;
  var PASSWORD_MAX_LENGTH = 128;

  var LOWER_RE = /[a-z]/;
  var UPPER_RE = /[A-Z]/;
  var DIGIT_RE = /[0-9]/;
  var SPECIAL_RE = /[!-\/:-@[-`{-~]/;
  var WHITESPACE_RE = /\s/;

  var COMMON_PASSWORDS = {
    password: true,
    password1: true,
    password12: true,
    password123: true,
    password1234: true,
    "123456789": true,
    "1234567890": true,
    "12345678910": true,
    "123456789101": true,
    qwerty123: true,
    qwertyuiop: true,
    letmein: true,
    welcome: true,
    welcome1: true,
    welcome123: true,
    admin123: true,
    changeme: true,
    kanasaka: true,
    kanasaka123: true,
    ksunify: true,
    iloveyou: true,
    sunshine: true,
    football: true,
    baseball: true,
    monkey: true,
    dragon: true,
    master: true,
    login123: true,
    passw0rd: true,
    trustno1: true,
    superman: true,
    batman: true,
    shadow: true,
    hello123: true,
    charlie: true,
    mustang: true,
    abc123: true,
    abc123456789: true,
    "111111111111": true,
    "000000000000": true,
    "123123123123": true,
    "654321654321": true,
    qwerty123456: true,
    asdfghjkl123: true,
    zxcvbnm12345: true,
  };

  function emailLocalPart(email) {
    var normalized = String(email || "").trim().toLowerCase();
    var at = normalized.indexOf("@");
    if (at <= 0) {
      return "";
    }
    return normalized.slice(0, at);
  }

  function hasTripleRepeat(password) {
    for (var i = 0; i < password.length - 2; i += 1) {
      if (password[i] === password[i + 1] && password[i] === password[i + 2]) {
        return true;
      }
    }
    return false;
  }

  function rules() {
    return [
      { id: "length", label: "At least " + PASSWORD_MIN_LENGTH + " characters" },
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

  function evaluate(password, context) {
    context = context || {};
    var value = typeof password === "string" ? password : "";
    var emailPart = emailLocalPart(context.email);
    var lowered = value.toLowerCase();

    return {
      length: value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH,
      upper: UPPER_RE.test(value),
      lower: LOWER_RE.test(value),
      digit: DIGIT_RE.test(value),
      special: SPECIAL_RE.test(value),
      noSpace: value.length > 0 && !WHITESPACE_RE.test(value),
      noRepeat: value.length > 0 && !hasTripleRepeat(value),
      notCommon: value.length > 0 && !COMMON_PASSWORDS[lowered],
      notEmail: !emailPart || emailPart.length < 3 || lowered.indexOf(emailPart) === -1,
    };
  }

  function error(password, context) {
    if (typeof password !== "string") {
      return "Enter a valid password.";
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
      return "Password must be at most " + PASSWORD_MAX_LENGTH + " characters.";
    }

    var checks = evaluate(password, context);

    if (!checks.length) {
      return "Password must be at least " + PASSWORD_MIN_LENGTH + " characters.";
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

  function renderChecklist(container, password, context) {
    if (!container) {
      return;
    }

    var checks = evaluate(password, context);
    var html = "";

    rules().forEach(function (rule) {
      var passed = Boolean(checks[rule.id]);
      var stateClass = passed ? "is-pass" : password ? "is-fail" : "is-pending";
      html +=
        '<li class="password-policy-item ' +
        stateClass +
        '"><span class="password-policy-mark" aria-hidden="true"></span>' +
        rule.label +
        "</li>";
    });

    container.innerHTML = html;
  }

  global.KanasakaPasswordPolicy = {
    MIN_LENGTH: PASSWORD_MIN_LENGTH,
    MAX_LENGTH: PASSWORD_MAX_LENGTH,
    rules: rules,
    evaluate: evaluate,
    error: error,
    renderChecklist: renderChecklist,
  };
})(window);
