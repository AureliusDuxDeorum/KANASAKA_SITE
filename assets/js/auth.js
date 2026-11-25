(function () {
  let sessionCache = null;

  function initOtpGroup(groupEl, hiddenInput, length) {
    if (!groupEl || !hiddenInput) return;

    const digits = length || 6;
    groupEl.innerHTML = "";
    const boxes = [];

    for (let i = 0; i < digits; i += 1) {
      const box = document.createElement("input");
      box.type = "text";
      box.inputMode = "numeric";
      box.autocomplete = i === 0 ? "one-time-code" : "off";
      box.maxLength = 1;
      box.className = "otp-box";
      box.setAttribute("aria-label", "Digit " + (i + 1));
      groupEl.appendChild(box);
      boxes.push(box);
    }

    function sync() {
      hiddenInput.value = boxes.map(function (b) { return b.value; }).join("");
    }

    boxes.forEach(function (box, index) {
      box.addEventListener("input", function () {
        box.value = box.value.replace(/[^0-9]/g, "").slice(-1);
        if (box.value && index < boxes.length - 1) {
          boxes[index + 1].focus();
        }
        sync();
      });

      box.addEventListener("keydown", function (event) {
        if (event.key === "Backspace" && !box.value && index > 0) {
          boxes[index - 1].focus();
        } else if (event.key === "ArrowLeft" && index > 0) {
          boxes[index - 1].focus();
        } else if (event.key === "ArrowRight" && index < boxes.length - 1) {
          boxes[index + 1].focus();
        }
      });

      box.addEventListener("paste", function (event) {
        const clipboard = event.clipboardData || window.clipboardData;
        const text = clipboard.getData("text").replace(/[^0-9]/g, "");
        if (!text) return;
        event.preventDefault();
        boxes.forEach(function (b, i) {
          b.value = text[i] || "";
        });
        const nextEmpty = boxes.findIndex(function (b) { return !b.value; });
        (nextEmpty === -1 ? boxes[boxes.length - 1] : boxes[nextEmpty]).focus();
        sync();
      });
    });

    return {
      clear: function () {
        boxes.forEach(function (b) { b.value = ""; });
        hiddenInput.value = "";
        boxes[0].focus();
      },
    };
  }

  // Loading mark: the KS logo drawn by three bending lines (animation in
  // style.css, .ks-loader).
  const KS_SPINNER_HTML =
    "<svg class=\"ks-loader\" viewBox=\"0 0 1523.6 761.85\" role=\"status\" aria-label=\"Loading\" focusable=\"false\"><path class=\"ks-loader-whole\" d=\"M0,0 L101.6,0 L101.6,514.4 L615.98,0 L761.75,0 L380.73,380.7 L460.22,460.1 L920.35,0 L1523.6,0 L1523.6,101.8 L964.6,101.8 L863.1,203.08 L863.1,334.88 L1523.6,334.88 L1523.6,606.05 L1371.35,761.85 L615.98,761.85 L460.22,606.05 L307.35,761.85 L0,761.85 Z M761.75,304.45 L761.75,436.43 L1421.9,436.43 L1421.9,565.2 L1326.98,660.12 L659.85,660.12 L533.25,533 Z M307.35,453.7 L387.48,533 L260.35,660.12 L101.6,660.12 Z\"/><path class=\"ks-line ks-line--a\" pathLength=\"100\" d=\"M50.8,-120 L50.8,710.95 L283.12,710.95 L943.27,50.9 L1523.6,50.9\"/><path class=\"ks-line ks-line--b\" pathLength=\"100\" d=\"M50.8,637.9 L728.7,-40\"/><path class=\"ks-line ks-line--c\" pathLength=\"100\" d=\"M307,380 L638,710.95 L1348.3,710.95 L1472.75,586.5 L1472.75,385.65 L812.4,385.65 L812.4,181.7\"/></svg>";

  function setButtonLoading(button, isLoading) {
    if (!button) return;
    if (isLoading) {
      if (button.dataset.originalLabel === undefined) {
        button.dataset.originalLabel = button.innerHTML;
      }
      button.disabled = true;
      button.innerHTML = KS_SPINNER_HTML;
    } else {
      button.disabled = false;
      if (button.dataset.originalLabel !== undefined) {
        button.innerHTML = button.dataset.originalLabel;
        delete button.dataset.originalLabel;
      }
    }
  }

  // Where to go after signing in. `next` is a same-site page (protected pages
  // send people to /login/?next=...).
  function getNextPath() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (!next || !next.startsWith("/") || next.startsWith("//")) {
      return "/";
    }
    return next;
  }

  function goAfterSignIn(path) {
    window.location.href = path;
  }

  async function apiRequest(path, options) {
    const response = await fetch(path, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    });

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text.slice(0, 240) };
      }
    }

    return { response, data };
  }

  async function initSession() {
    try {
      const { data } = await apiRequest("/api/auth/session", { method: "GET" });
      sessionCache = data || { authenticated: false };
    } catch {
      sessionCache = { authenticated: false };
    }
    return sessionCache;
  }

  function getSession() {
    return sessionCache || { authenticated: false };
  }

  function canSeeAccountGated(requiredAccountId) {
    if (!requiredAccountId) {
      return true;
    }

    const session = getSession();
    return (
      session.authenticated &&
      String(session.accountId || "").toLowerCase() ===
        String(requiredAccountId).toLowerCase()
    );
  }

  function applyAccountGatedVisibility(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-visible-account-id]").forEach(function (el) {
      el.hidden = !canSeeAccountGated(el.getAttribute("data-visible-account-id"));
    });
  }

  async function login(email, password, form) {
    const rememberField = form ? form.querySelector('[name="remember"]') : null;
    const remember = rememberField ? rememberField.checked : true;

    const { response, data } = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, remember }),
    });

    if (!response.ok) {
      throw new Error((data && data.error) || "Login failed.");
    }

    sessionCache = data;
    return data;
  }

  async function register(email, password, form) {
    const tosCheckbox = form.querySelector('[name="tosAccepted"]');
    const accountIdField = form.querySelector('[name="accountId"]');
    const accountId = accountIdField ? accountIdField.value.trim() : "";

    if (tosCheckbox && !tosCheckbox.checked) {
      throw new Error(
        "You must accept the Terms of Service and Privacy Policy."
      );
    }

    const payload = {
      email,
      password,
      tosAccepted: Boolean(tosCheckbox && tosCheckbox.checked),
      // Same constant the acceptance modal records (assets/js/tos.js), so a Terms
      // version bump can never leave registration sending a stale one.
      tosVersion: (window.KanasakaTerms && window.KanasakaTerms.TOS_VERSION) || "7",
    };

    if (accountId) {
      payload.accountId = accountId;
    }

    const { response, data } = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error((data && data.error) || "Registration failed.");
    }

    return data;
  }

  async function logout() {
    const { data } = await apiRequest("/api/auth/logout", {
      method: "POST",
      body: "{}",
    });
    sessionCache = data || { authenticated: false };
    return sessionCache;
  }

  function showFormError(form, message) {
    let error = form.querySelector(".auth-error");
    if (!error) {
      error = document.createElement("p");
      error.className = "auth-error";
      form.insertBefore(error, form.firstChild);
    }
    error.textContent = message;
    error.hidden = false;
  }

  function clearFormError(form) {
    const error = form.querySelector(".auth-error");
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
  }

  function showFormSuccess(form, message) {
    let success = form.querySelector(".auth-success");
    if (!success) {
      success = document.createElement("p");
      success.className = "auth-success";
      form.insertBefore(success, form.firstChild);
    }
    success.textContent = message;
    success.hidden = false;
  }

  function clearFormSuccess(form) {
    const success = form.querySelector(".auth-success");
    if (success) {
      success.hidden = true;
      success.textContent = "";
    }
  }

  function getPasswordPolicy() {
    return window.KanasakaPasswordPolicy || null;
  }

  function validateNewPassword(password, context) {
    const policy = getPasswordPolicy();
    if (!policy) {
      return null;
    }
    return policy.error(password, context || {});
  }

  function bindPasswordPolicyField(config) {
    const policy = getPasswordPolicy();
    if (!policy || !config.passwordInput || !config.checklist) {
      return;
    }

    function refresh() {
      const context = config.getContext ? config.getContext() : {};
      policy.renderChecklist(config.checklist, config.passwordInput.value, context);
    }

    config.passwordInput.addEventListener("input", refresh);
    config.passwordInput.addEventListener("blur", refresh);

    if (config.contextInput) {
      config.contextInput.addEventListener("input", refresh);
    }

    refresh();
  }

  function initPasswordPolicyFields() {
    bindPasswordPolicyField({
      passwordInput: document.getElementById("register-password"),
      checklist: document.getElementById("register-password-policy"),
      contextInput: document.getElementById("register-email"),
      getContext: function () {
        const emailInput = document.getElementById("register-email");
        return { email: emailInput ? emailInput.value.trim() : "" };
      },
    });

    bindPasswordPolicyField({
      passwordInput: document.getElementById("reset-password"),
      checklist: document.getElementById("reset-password-policy"),
    });

    bindPasswordPolicyField({
      passwordInput: document.getElementById("settings-new-password"),
      checklist: document.getElementById("settings-new-password-policy"),
      contextInput: document.getElementById("settings-email"),
      getContext: function () {
        const emailInput = document.getElementById("settings-email");
        return { email: emailInput ? emailInput.value.trim() : "" };
      },
    });
  }

  function bindForgotPasswordForm() {
    const form = document.getElementById("forgot-password-form");
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(form);

      const email = form.querySelector('[name="email"]').value.trim();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;

      try {
        const { response, data } = await apiRequest("/api/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email }),
        });

        if (!response.ok) {
          throw new Error((data && data.error) || "Request failed.");
        }

        window.location.href = "/reset-password/?email=" + encodeURIComponent(email);
      } catch (error) {
        showFormError(form, error.message || "Request failed.");
        submit.disabled = false;
      }
    });
  }

  function bindResetPasswordForm() {
    const form = document.getElementById("reset-password-form");
    if (!form) return;

    const emailField = form.querySelector('[name="email"]');
    const resendBtn = document.getElementById("reset-resend");

    initOtpGroup(document.getElementById("reset-code-boxes"), form.querySelector('[name="code"]'));

    const params = new URLSearchParams(window.location.search);
    const prefillEmail = params.get("email");
    if (prefillEmail && emailField) {
      emailField.value = prefillEmail;
    }

    const steps = setupSteps(form, ["email", "code", "password"]);

    ["email", "code"].forEach(function (stepName) {
      bindEnterAdvance(
        form.querySelector('[data-step="' + stepName + '"]'),
        form.querySelector('[data-step="' + stepName + '"] [data-action="next"]')
      );
    });

    form.querySelectorAll('[data-action="next"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (steps.current() === "email") {
          if (!emailField.value.trim() || !EMAIL_FORMAT_RE.test(emailField.value.trim())) {
            emailField.focus();
            return;
          }
        }
        if (steps.current() === "code") {
          const codeValue = form.querySelector('[name="code"]').value.trim();
          if (codeValue.length !== 6) {
            const firstBox = form.querySelector("#reset-code-boxes .otp-box");
            if (firstBox) firstBox.focus();
            return;
          }
        }
        steps.next();
      });
    });

    form.querySelectorAll('[data-action="back"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        steps.back();
      });
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (steps.current() !== "password") {
        steps.next();
        return;
      }

      clearFormError(form);

      const email = emailField.value.trim();
      const code = form.querySelector('[name="code"]').value.trim();
      const password = form.querySelector('[name="password"]').value;
      const submit = form.querySelector('[type="submit"]');

      const passwordError = validateNewPassword(password);
      if (passwordError) {
        showFormError(form, passwordError);
        return;
      }

      submit.disabled = true;

      try {
        const { response, data } = await apiRequest("/api/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ email, code, password }),
        });

        if (!response.ok) {
          throw new Error((data && data.error) || "Reset failed.");
        }

        showFormSuccess(form, data.message);
        window.setTimeout(function () {
          window.location.href = "/login/";
        }, 2000);
      } catch (error) {
        showFormError(form, error.message || "Request failed.");
        submit.disabled = false;
      }
    });

    if (resendBtn) {
      resendBtn.addEventListener("click", async function () {
        clearFormError(form);
        clearFormSuccess(form);

        const email = emailField.value.trim();
        if (!email) {
          showFormError(form, "Enter your email first.");
          return;
        }

        resendBtn.disabled = true;
        try {
          const { data } = await apiRequest("/api/auth/forgot-password", {
            method: "POST",
            body: JSON.stringify({ email }),
          });
          showFormSuccess(form, (data && data.message) || "If an account exists for that email, a password reset code has been sent.");
        } catch {
          showFormError(form, "Could not resend code. Try again later.");
        } finally {
          resendBtn.disabled = false;
        }
      });
    }
  }

  function initVerifyPage() {
    const form = document.getElementById("verify-form");
    if (!form) return;

    const emailField = form.querySelector('[name="email"]');
    const codeField = form.querySelector('[name="code"]');
    const resendBtn = document.getElementById("verify-resend");

    initOtpGroup(document.getElementById("verify-code-boxes"), codeField);

    const params = new URLSearchParams(window.location.search);
    const prefillEmail = params.get("email");
    if (prefillEmail && emailField) {
      emailField.value = prefillEmail;
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(form);
      clearFormSuccess(form);

      const email = emailField.value.trim();
      const code = codeField.value.trim();
      const submit = form.querySelector('[type="submit"]');
      const defaultLabel = submit.textContent;
      submit.disabled = true;
      submit.textContent = "Verifying...";

      try {
        const { response, data } = await apiRequest("/api/auth/verify", {
          method: "POST",
          body: JSON.stringify({ email, code }),
        });

        if (!response.ok) {
          throw new Error((data && data.error) || "Verification failed.");
        }

        sessionCache = data;
        showFormSuccess(form, "Email verified. Redirecting...");
        window.setTimeout(function () {
          const target = getNextPath();
          goAfterSignIn(target === "/" ? "/downloads/" : target);
        }, 1200);
      } catch (error) {
        showFormError(form, error.message || "Verification failed.");
        submit.disabled = false;
        submit.textContent = defaultLabel;
      }
    });

    if (resendBtn) {
      resendBtn.addEventListener("click", async function () {
        clearFormError(form);
        clearFormSuccess(form);

        const email = emailField.value.trim();
        if (!email) {
          showFormError(form, "Enter your email first.");
          return;
        }

        resendBtn.disabled = true;
        try {
          const { data } = await apiRequest("/api/auth/resend-verification", {
            method: "POST",
            body: JSON.stringify({ email }),
          });
          showFormSuccess(form, (data && data.message) || "If an account exists for that email, a verification code has been sent.");
        } catch {
          showFormError(form, "Could not resend code. Try again later.");
        } finally {
          resendBtn.disabled = false;
        }
      });
    }
  }

  function renderAuthGate(gateId, message) {
    const gate = document.getElementById(gateId);
    if (!gate) return;

    gate.hidden = false;
    gate.innerHTML =
      '<div class="auth-gate-box">' +
      '<span class="coming-soon-label">Account Required</span>' +
      "<h2>Log in to continue</h2>" +
      "<p>" + message + "</p>" +
      '<div class="auth-gate-actions">' +
      '<a class="button" href="/login/?next=' +
      encodeURIComponent(window.location.pathname) +
      '">Log In</a>' +
      '<a class="button secondary" href="/register/?next=' +
      encodeURIComponent(window.location.pathname) +
      '">Register</a>' +
      "</div></div>";
  }

  function renderContactDetails(container, contact) {
    container.innerHTML =
      '<dl class="contact-item">' +
      "<dt>Email</dt>" +
      '<dd><a href="mailto:' +
      contact.email +
      '">' +
      contact.email +
      "</a></dd>" +
      (contact.note
        ? '<dd class="contact-note">' + contact.note + "</dd>"
        : "") +
      "</dl>";
    container.hidden = false;
  }

  async function initContactPage() {
    const gate = document.getElementById("auth-gate-contact");
    const details = document.getElementById("contact-details");
    if (!gate || !details) return;

    const session = getSession();
    if (!session.authenticated) {
      renderAuthGate(
        "auth-gate-contact",
        "Contact details are only visible to signed-in users."
      );
      details.hidden = true;
      return;
    }

    const { response, data } = await apiRequest("/api/contact", { method: "GET" });
    if (!response.ok) {
      renderAuthGate(
        "auth-gate-contact",
        "Contact details are only visible to signed-in users."
      );
      details.hidden = true;
      return;
    }

    gate.hidden = true;
    renderContactDetails(details, data);
  }

  function updateSession(data) {
    sessionCache = Object.assign({ authenticated: true }, data);
    if (window.KanasakaLayout && window.KanasakaLayout.remount) {
      window.KanasakaLayout.remount();
    }
  }

  function renderAvatarElement(container, profile) {
    container.innerHTML = "";
    if (profile.hasAvatar && profile.avatarUrl) {
      const img = document.createElement("img");
      img.src = profile.avatarUrl;
      img.alt = "Profile picture";
      container.appendChild(img);
      return;
    }

    container.textContent = profile.initials || "KS";
  }

  function formatAccountIdNextChange(isoValue) {
    if (!isoValue) {
      return "";
    }

    return new Date(isoValue).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function applyAccountIdFieldState(profile, accountIdInput, accountIdHint) {
    if (!accountIdInput) {
      return;
    }

    accountIdInput.value = profile.accountId || "";

    if (!profile.accountId) {
      accountIdInput.disabled = false;
      if (accountIdHint) {
        accountIdHint.textContent =
          "Choose a unique ID for permissions and lookup. You can change it once every 6 months after it is set.";
      }
      return;
    }

    if (profile.accountIdChangeAllowed) {
      accountIdInput.disabled = false;
      if (accountIdHint) {
        accountIdHint.textContent =
          "Your ID is @" +
          profile.accountId +
          ". You may change it now (once every 6 months).";
      }
      return;
    }

    accountIdInput.disabled = true;
    if (accountIdHint) {
      const nextChange = formatAccountIdNextChange(profile.accountIdNextChangeAt);
      accountIdHint.textContent =
        "Account ID @" +
        profile.accountId +
        (nextChange
          ? " is locked until " + nextChange + "."
          : " can only be changed every 6 months.");
    }
  }

  function initAuthPageMotion() {
    const page = document.querySelector(".auth-page");
    if (!page) {
      return;
    }

    window.requestAnimationFrame(function () {
      page.classList.add("is-ready");
    });
  }

  function initThemePicker() {
    if (!window.KanasakaTheme) return;

    window.KanasakaTheme.syncThemePicker(window.KanasakaTheme.getTheme());

    document.querySelectorAll("[data-theme-option]").forEach(function (button) {
      button.addEventListener("click", function () {
        const theme = button.getAttribute("data-theme-option");
        window.KanasakaTheme.setTheme(theme);
      });
    });
  }

  function initMotionPicker() {
    const buttons = document.querySelectorAll("[data-motion-option]");
    if (!buttons.length || !window.KanasakaMotion) return;

    function sync() {
      const pref = window.KanasakaMotion.getPref();
      buttons.forEach(function (button) {
        const selected = button.getAttribute("data-motion-option") === pref;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        window.KanasakaMotion.setPref(button.getAttribute("data-motion-option"));
        sync();
      });
    });
    sync();
  }

  function initProtectedPages() {
    applyAccountGatedVisibility(document);

    const path = window.location.pathname;

    if (path.indexOf("/support/contact") === 0) {
      initContactPage();
    }

    if (path.indexOf("/verify") === 0) {
      initVerifyPage();
    }

    if (path.indexOf("/login") === 0) {
      openAuthModal("login");
    }

    if (path.indexOf("/register") === 0) {
      openAuthModal("register");
    }
  }

  function initRegisterAccountIdCheck() {
    const input = document.getElementById("register-account-id");
    const status = document.getElementById("register-account-id-status");
    if (!input || !status) return;

    var timer = null;

    function setStatus(message, isError) {
      status.textContent = message;
      status.hidden = !message;
      status.classList.toggle("is-error", Boolean(isError));
      status.classList.toggle("is-ok", Boolean(message) && !isError);
    }

    input.addEventListener("input", function () {
      window.clearTimeout(timer);
      const value = input.value.trim().toLowerCase();
      if (!value) {
        setStatus("", false);
        return;
      }

      timer = window.setTimeout(async function () {
        try {
          const { response, data } = await apiRequest(
            "/api/account/id-available?accountId=" + encodeURIComponent(value),
            { method: "GET" }
          );
          if (!response.ok) {
            setStatus((data && data.error) || "Could not check ID.", true);
            return;
          }
          if (data.available) {
            setStatus("@" + data.accountId + " is available.", false);
          } else {
            setStatus(
              (data && data.error) || "That account ID is already taken.",
              true
            );
          }
        } catch {
          setStatus("Could not check ID.", true);
        }
      }, 350);
    });
  }

  function initAuthForms() {
    bindForgotPasswordForm();
    bindResetPasswordForm();
    initPasswordPolicyFields();
    initAuthPageMotion();
  }

  // ===== Auth modal: stepped login/register overlay =====

  const REMEMBERED_ACCOUNTS_KEY = "kanasaka:rememberedAccounts";
  const REMEMBERED_ACCOUNTS_MAX = 5;
  const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function getRememberedAccounts() {
    try {
      const raw = window.localStorage.getItem(REMEMBERED_ACCOUNTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function saveRememberedAccount(account) {
    if (!account || !account.email) return;
    try {
      const list = getRememberedAccounts().filter(function (a) {
        return a.email !== account.email;
      });
      list.unshift({
        email: account.email,
        displayLabel: account.displayLabel || account.email,
        initials: account.initials || "KS",
      });
      window.localStorage.setItem(
        REMEMBERED_ACCOUNTS_KEY,
        JSON.stringify(list.slice(0, REMEMBERED_ACCOUNTS_MAX))
      );
    } catch {
      // localStorage unavailable (private mode, etc.) -- not critical
    }
  }

  function removeRememberedAccount(email) {
    try {
      const list = getRememberedAccounts().filter(function (a) {
        return a.email !== email;
      });
      window.localStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  function getModalFocusable(overlay) {
    const nodes = overlay.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    );
    return Array.prototype.filter.call(nodes, function (el) {
      return el.offsetParent !== null;
    });
  }

  function modalKeydownHandler(event) {
    if (event.key === "Escape") {
      dismissAuthModal();
      return;
    }

    if (event.key !== "Tab") return;

    const overlay = document.getElementById("auth-modal-overlay");
    if (!overlay) return;

    const focusable = getModalFocusable(overlay);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!overlay.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  }

  function buildAuthModalShell() {
    const overlay = document.createElement("div");
    overlay.className = "auth-modal-overlay";
    overlay.id = "auth-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const backdrop = document.createElement("div");
    backdrop.className = "auth-modal-backdrop";
    backdrop.setAttribute("data-modal-dismiss", "");

    const shell = document.createElement("div");
    shell.className = "auth-modal-shell";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "auth-modal-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    closeBtn.setAttribute("data-modal-dismiss", "");

    const card = document.createElement("div");
    card.className = "auth-card auth-card--modern auth-card-elevated auth-modal-card";

    const accent = document.createElement("div");
    accent.className = "auth-card-accent";
    accent.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "auth-card-body";
    body.id = "auth-modal-content";

    card.appendChild(accent);
    card.appendChild(body);
    shell.appendChild(closeBtn);
    shell.appendChild(card);
    overlay.appendChild(backdrop);
    overlay.appendChild(shell);

    overlay.addEventListener("click", function (event) {
      if (event.target && event.target.hasAttribute("data-modal-dismiss")) {
        dismissAuthModal();
      }
    });

    return { overlay: overlay, content: body };
  }

  function closeAuthModal() {
    const overlay = document.getElementById("auth-modal-overlay");
    document.removeEventListener("keydown", modalKeydownHandler);
    document.body.classList.remove("auth-modal-open");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    window.setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 280);
  }

  function onAuthModalPage() {
    const path = window.location.pathname;
    return path.indexOf("/login") === 0 || path.indexOf("/register") === 0;
  }

  function dismissAuthModal() {
    const wasDedicatedPage = onAuthModalPage();
    closeAuthModal();
    if (wasDedicatedPage) {
      window.location.href = "/";
    }
  }

  function finishAuthModalSuccess(sessionData) {
    updateSession(sessionData);
    const wasDedicatedPage = onAuthModalPage();
    closeAuthModal();
    if (wasDedicatedPage) {
      goAfterSignIn(getNextPath());
    }
  }

  function openAuthModal(mode) {
    const existing = document.getElementById("auth-modal-overlay");
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    document.removeEventListener("keydown", modalKeydownHandler);

    const built = buildAuthModalShell();
    document.body.appendChild(built.overlay);
    document.body.classList.add("auth-modal-open");
    document.addEventListener("keydown", modalKeydownHandler);

    if (mode === "register") {
      renderAuthModalRegister(built.content);
    } else {
      renderAuthModalLogin(built.content);
    }

    window.requestAnimationFrame(function () {
      built.overlay.classList.add("is-open");
      const focusable = getModalFocusable(built.overlay);
      const firstField = focusable.find(function (el) {
        return el.tagName === "INPUT" || el.getAttribute("role") === "button";
      });
      const toFocus = firstField || focusable[0];
      if (toFocus) toFocus.focus();
    });
  }

  function setupSteps(form, order) {
    const panels = {};
    order.forEach(function (name) {
      panels[name] = form.querySelector('[data-step="' + name + '"]');
    });
    let current = order[0];

    function show(name) {
      if (!panels[name]) return;
      current = name;
      order.forEach(function (n) {
        if (panels[n]) panels[n].hidden = n !== name;
      });
      window.setTimeout(function () {
        const target = panels[name].querySelector("input, .otp-box");
        if (target) target.focus();
      }, 30);
    }

    return {
      show: show,
      next: function () {
        const idx = order.indexOf(current);
        if (idx < order.length - 1) show(order[idx + 1]);
      },
      back: function () {
        const idx = order.indexOf(current);
        if (idx > 0) show(order[idx - 1]);
      },
      current: function () {
        return current;
      },
    };
  }

  function addPasswordToggle(input) {
    if (!input || input.dataset.toggleAdded) return;
    input.dataset.toggleAdded = "1";

    const wrap = document.createElement("div");
    wrap.className = "auth-password-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "auth-password-toggle";
    toggle.textContent = "Show";
    toggle.setAttribute("aria-label", "Show password");
    toggle.addEventListener("click", function () {
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.textContent = showing ? "Show" : "Hide";
      toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    });
    wrap.appendChild(toggle);
  }

  function bindEnterAdvance(panel, button) {
    if (!panel || !button) return;
    panel.querySelectorAll("input").forEach(function (input) {
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          button.click();
        }
      });
    });
  }

  function renderAuthModalLogin(root) {
    const hasChooser = getRememberedAccounts().length > 0;

    root.innerHTML =
      (hasChooser
        ? '<div class="auth-modal-step" data-step="chooser">' +
          '<p class="auth-eyebrow">Account</p>' +
          "<h1>Log In</h1>" +
          '<p class="auth-lead">Choose an account to continue.</p>' +
          '<div class="auth-modal-chooser-list" id="auth-modal-chooser-list"></div>' +
          '<button type="button" class="button secondary" data-action="new-account">Log in with new account</button>' +
          "</div>"
        : "") +
      '<form id="auth-modal-login-form" novalidate>' +
      '<div class="auth-modal-step" data-step="email"' +
      (hasChooser ? " hidden" : "") +
      ">" +
      '<p class="auth-eyebrow">Account · Step 1 of 2</p>' +
      "<h1>Log In</h1>" +
      '<p class="auth-lead">Enter your email to continue.</p>' +
      '<div class="auth-field">' +
      '<label for="auth-modal-login-email">Email</label>' +
      '<input id="auth-modal-login-email" name="email" type="email" autocomplete="email" required>' +
      "</div>" +
      '<button type="button" class="button auth-submit" data-action="next">Continue</button>' +
      (hasChooser
        ? '<p class="auth-switch"><button type="button" class="link-button" data-action="back">Back</button></p>'
        : "") +
      "</div>" +
      '<div class="auth-modal-step" data-step="password" hidden>' +
      '<p class="auth-eyebrow">Account · Step 2 of 2</p>' +
      "<h1>Log In</h1>" +
      '<p class="auth-lead" id="auth-modal-login-password-lead">Enter your password.</p>' +
      '<div class="auth-field">' +
      '<label for="auth-modal-login-password">Password</label>' +
      '<input id="auth-modal-login-password" name="password" type="password" autocomplete="current-password" required>' +
      "</div>" +
      '<label class="auth-legal-consent">' +
      '<input id="auth-modal-login-remember" name="remember" type="checkbox" value="1" checked>' +
      "<span>Stay logged in on this device.</span>" +
      "</label>" +
      '<button type="submit" class="button auth-submit">Log In</button>' +
      '<p class="auth-switch"><button type="button" class="link-button" data-action="back">Back</button> · <a href="/forgot-password/">Forgot password?</a></p>' +
      "</div>" +
      "</form>" +
      '<form id="auth-modal-login-verify-form" hidden>' +
      '<p class="auth-eyebrow">Account</p>' +
      "<h1>Verification</h1>" +
      '<p class="auth-lead" id="auth-modal-login-verify-lead">Enter the 6-digit code.</p>' +
      '<div class="auth-field" id="auth-modal-login-verify-otp-field">' +
      '<label id="auth-modal-login-verify-label">Verification code</label>' +
      '<div class="otp-boxes" id="auth-modal-login-verify-boxes" role="group" aria-labelledby="auth-modal-login-verify-label"></div>' +
      '<input type="hidden" name="code">' +
      "</div>" +
      '<div class="auth-field" id="auth-modal-login-verify-backup-field" hidden>' +
      '<label for="auth-modal-login-verify-backup">Backup code</label>' +
      '<input id="auth-modal-login-verify-backup" type="text" autocomplete="off" placeholder="XXXXX-XXXXX">' +
      "</div>" +
      '<button type="submit" class="button auth-submit">Verify</button>' +
      '<p class="auth-switch"><button type="button" class="link-button" data-action="send-email-code" hidden>Email me a code instead</button></p>' +
      '<p class="auth-switch"><button type="button" class="link-button" data-action="toggle-backup-code">Use a backup code instead</button></p>' +
      "</form>" +
      '<p class="auth-switch auth-modal-switch-mode">No account yet? <button type="button" class="link-button" data-action="switch-mode">Register</button></p>';

    const loginForm = root.querySelector("#auth-modal-login-form");
    const verifyForm = root.querySelector("#auth-modal-login-verify-form");
    const chooserList = root.querySelector("#auth-modal-chooser-list");
    const chooserStep = root.querySelector('[data-step="chooser"]');
    const switchModeBtn = root.querySelector('[data-action="switch-mode"]');
    const steps = setupSteps(loginForm, ["email", "password"]);

    addPasswordToggle(document.getElementById("auth-modal-login-password"));

    let selectedEmail = "";

    function showLoginStep(name) {
      if (name === "chooser") {
        if (chooserStep) chooserStep.hidden = false;
        loginForm.hidden = true;
      } else {
        if (chooserStep) chooserStep.hidden = true;
        loginForm.hidden = false;
        steps.show(name);
      }
    }

    function renderChooser() {
      if (!chooserList) return;
      chooserList.innerHTML = "";
      getRememberedAccounts().forEach(function (acct) {
        const item = document.createElement("div");
        item.className = "auth-modal-chooser-item";
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");

        const avatar = document.createElement("span");
        avatar.className = "auth-modal-chooser-avatar";
        avatar.textContent = acct.initials || "KS";

        const info = document.createElement("span");
        info.className = "auth-modal-chooser-info";
        const name = document.createElement("span");
        name.className = "auth-modal-chooser-name";
        name.textContent = acct.displayLabel || acct.email;
        const email = document.createElement("span");
        email.className = "auth-modal-chooser-email";
        email.textContent = acct.email;
        info.appendChild(name);
        info.appendChild(email);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "auth-modal-chooser-remove";
        remove.setAttribute("aria-label", "Forget this account");
        remove.textContent = "×";
        remove.addEventListener("click", function (event) {
          event.stopPropagation();
          removeRememberedAccount(acct.email);
          renderChooser();
        });

        item.appendChild(avatar);
        item.appendChild(info);
        item.appendChild(remove);

        function selectAccount() {
          selectedEmail = acct.email;
          const passwordLead = root.querySelector("#auth-modal-login-password-lead");
          if (passwordLead) passwordLead.textContent = "Signing in as " + acct.email + ".";
          showLoginStep("password");
        }

        item.addEventListener("click", selectAccount);
        item.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectAccount();
          }
        });

        chooserList.appendChild(item);
      });
    }

    if (hasChooser) {
      renderChooser();
      const newAccountBtn = root.querySelector('[data-action="new-account"]');
      if (newAccountBtn) {
        newAccountBtn.addEventListener("click", function () {
          selectedEmail = "";
          showLoginStep("email");
        });
      }
    }

    bindEnterAdvance(
      loginForm.querySelector('[data-step="email"]'),
      loginForm.querySelector('[data-step="email"] [data-action="next"]')
    );

    loginForm.querySelectorAll('[data-action="back"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (steps.current() === "email" && hasChooser) {
          showLoginStep("chooser");
        } else {
          steps.back();
        }
      });
    });

    loginForm.querySelector('[data-action="next"]').addEventListener("click", function () {
      const emailInput = document.getElementById("auth-modal-login-email");
      const email = emailInput.value.trim();
      if (!email || !EMAIL_FORMAT_RE.test(email)) {
        emailInput.focus();
        return;
      }
      selectedEmail = email;
      steps.next();
    });

    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (steps.current() !== "password") {
        steps.next();
        return;
      }

      clearFormError(loginForm);
      const submit = loginForm.querySelector('[type="submit"]');
      setButtonLoading(submit, true);

      try {
        const result = await login(
          selectedEmail,
          loginForm.querySelector('[name="password"]').value,
          loginForm
        );

        if (result && result.twoFactorRequired) {
          loginForm.hidden = true;
          verifyForm.hidden = false;
          verifyForm.dataset.challenge = result.challenge || "";
          const destination = result.emailMasked || result.phoneMasked;
          const lead = root.querySelector("#auth-modal-login-verify-lead");
          verifyForm.dataset.method = result.method || "";
          // Authenticator + email codes on the account: nothing was emailed;
          // the user can ask for it.
          const offersEmail =
            result.method === "totp" && Array.isArray(result.methods) && result.methods.indexOf("email") !== -1;
          verifyForm.dataset.emailMasked = result.emailMasked || "";
          const sendEmailBtn = verifyForm.querySelector('[data-action="send-email-code"]');
          if (sendEmailBtn) sendEmailBtn.hidden = !offersEmail;
          if (lead) {
            lead.textContent =
              result.method === "totp"
                ? "Enter the 6-digit code from your authenticator app."
                : destination
                  ? "Enter the 6-digit code we sent to " + destination + "."
                  : "Enter the 6-digit code we sent you.";
          }
          const firstBox = root.querySelector("#auth-modal-login-verify-boxes .otp-box");
          if (firstBox) firstBox.focus();
          return;
        }

        if (loginForm.querySelector('[name="remember"]').checked) {
          saveRememberedAccount(result);
        }

        finishAuthModalSuccess(result);
      } catch (error) {
        showFormError(loginForm, error.message || "Login failed.");
      } finally {
        setButtonLoading(submit, false);
      }
    });

    initOtpGroup(root.querySelector("#auth-modal-login-verify-boxes"), verifyForm.querySelector('[name="code"]'));

    const sendEmailBtn = verifyForm.querySelector('[data-action="send-email-code"]');
    if (sendEmailBtn) {
      sendEmailBtn.addEventListener("click", async function () {
        clearFormError(verifyForm);
        sendEmailBtn.disabled = true;
        try {
          const { response, data } = await apiRequest("/api/auth/two-factor-send", {
            method: "POST",
            body: JSON.stringify({ challenge: verifyForm.dataset.challenge || "" }),
          });
          if (!response.ok) throw new Error((data && data.error) || "Could not send the code.");

          const lead = root.querySelector("#auth-modal-login-verify-lead");
          if (lead) {
            lead.textContent =
              "We sent a 6-digit code to " +
              (data.emailMasked || verifyForm.dataset.emailMasked || "your email") +
              ". Enter it here, or use the code from your authenticator app.";
          }
          sendEmailBtn.textContent = "Send the email code again";
        } catch (error) {
          showFormError(verifyForm, error.message || "Could not send the code.");
        } finally {
          sendEmailBtn.disabled = false;
        }
      });
    }

    const backupToggleBtn = verifyForm.querySelector('[data-action="toggle-backup-code"]');
    const otpField = verifyForm.querySelector("#auth-modal-login-verify-otp-field");
    const backupField = verifyForm.querySelector("#auth-modal-login-verify-backup-field");
    const backupInput = verifyForm.querySelector("#auth-modal-login-verify-backup");
    let usingBackupCode = false;

    if (backupToggleBtn) {
      backupToggleBtn.addEventListener("click", function () {
        usingBackupCode = !usingBackupCode;
        otpField.hidden = usingBackupCode;
        backupField.hidden = !usingBackupCode;
        backupToggleBtn.textContent = usingBackupCode
          ? verifyForm.dataset.method === "totp"
            ? "Use the authenticator code instead"
            : "Use the emailed code instead"
          : "Use a backup code instead";
        const toFocus = usingBackupCode
          ? backupInput
          : root.querySelector("#auth-modal-login-verify-boxes .otp-box");
        if (toFocus) toFocus.focus();
      });
    }

    verifyForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(verifyForm);
      const code = usingBackupCode
        ? backupInput.value.trim()
        : verifyForm.querySelector('[name="code"]').value.trim();
      const challenge = verifyForm.dataset.challenge || "";
      const submit = verifyForm.querySelector('[type="submit"]');
      setButtonLoading(submit, true);

      try {
        const { response, data } = await apiRequest("/api/auth/two-factor", {
          method: "POST",
          body: JSON.stringify({ challenge, code }),
        });

        if (!response.ok) {
          throw new Error((data && data.error) || "Verification failed.");
        }

        if (loginForm.querySelector('[name="remember"]').checked) {
          saveRememberedAccount(data);
        }

        finishAuthModalSuccess(data);
      } catch (error) {
        showFormError(verifyForm, error.message || "Verification failed.");
        setButtonLoading(submit, false);
      }
    });

    if (switchModeBtn) {
      switchModeBtn.addEventListener("click", function () {
        openAuthModal("register");
      });
    }
  }

  function renderAuthModalRegister(root) {
    root.innerHTML =
      '<form id="auth-modal-register-form" novalidate>' +
      '<div class="auth-modal-step" data-step="accountId">' +
      '<p class="auth-eyebrow">Account · Step 1 of 3</p>' +
      "<h1>Register</h1>" +
      '<p class="auth-lead">Choose an account ID, or skip for now.</p>' +
      '<div class="auth-field">' +
      '<label for="register-account-id">Account ID</label>' +
      '<input id="register-account-id" name="accountId" type="text" minlength="3" maxlength="32" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username">' +
      '<p class="auth-field-hint">Optional now — set or change anytime in Account Settings.</p>' +
      '<p id="register-account-id-status" class="auth-field-status" hidden></p>' +
      "</div>" +
      '<button type="button" class="button auth-submit" data-action="next">Continue</button>' +
      "</div>" +
      '<div class="auth-modal-step" data-step="email" hidden>' +
      '<p class="auth-eyebrow">Account · Step 2 of 3</p>' +
      "<h1>Register</h1>" +
      '<p class="auth-lead">Enter your email.</p>' +
      '<div class="auth-field">' +
      '<label for="auth-modal-register-email">Email</label>' +
      '<input id="auth-modal-register-email" name="email" type="email" autocomplete="email" required>' +
      "</div>" +
      '<button type="button" class="button auth-submit" data-action="next">Continue</button>' +
      '<p class="auth-switch"><button type="button" class="link-button" data-action="back">Back</button></p>' +
      "</div>" +
      '<div class="auth-modal-step" data-step="password" hidden>' +
      '<p class="auth-eyebrow">Account · Step 3 of 3</p>' +
      "<h1>Register</h1>" +
      '<p class="auth-lead">Choose a password.</p>' +
      '<div class="auth-field">' +
      '<label for="register-password">Password</label>' +
      '<input id="register-password" name="password" type="password" autocomplete="new-password" minlength="15" maxlength="128" required>' +
      '<ul id="register-password-policy" class="password-policy" aria-live="polite"></ul>' +
      "</div>" +
      '<label class="auth-legal-consent">' +
      '<input id="auth-modal-register-tos" name="tosAccepted" type="checkbox" value="1" required>' +
      '<span>I agree to the <a href="/legal/terms/" target="_blank" rel="noopener">Terms of Service</a> and <a href="/legal/privacy/" target="_blank" rel="noopener">Privacy Policy</a>.</span>' +
      "</label>" +
      '<button type="submit" class="button auth-submit">Create Account</button>' +
      '<p class="auth-switch"><button type="button" class="link-button" data-action="back">Back</button></p>' +
      "</div>" +
      "</form>" +
      '<form id="auth-modal-register-verify-form" hidden>' +
      '<p class="auth-eyebrow">Account</p>' +
      "<h1>Verify Email</h1>" +
      '<p class="auth-lead" id="auth-modal-register-verify-lead">Enter the 6-digit code we emailed you.</p>' +
      '<div class="auth-field">' +
      '<label id="auth-modal-register-verify-label">Verification code</label>' +
      '<div class="otp-boxes" id="auth-modal-register-verify-boxes" role="group" aria-labelledby="auth-modal-register-verify-label"></div>' +
      '<input type="hidden" name="code">' +
      "</div>" +
      '<button type="submit" class="button auth-submit">Verify</button>' +
      '<p class="auth-switch">Didn’t get a code? <button type="button" class="link-button" data-action="resend">Resend code</button></p>' +
      "</form>" +
      '<p class="auth-switch auth-modal-switch-mode">Already registered? <button type="button" class="link-button" data-action="switch-mode">Log in</button></p>';

    const registerForm = root.querySelector("#auth-modal-register-form");
    const verifyForm = root.querySelector("#auth-modal-register-verify-form");
    const switchModeBtn = root.querySelector('[data-action="switch-mode"]');
    const steps = setupSteps(registerForm, ["accountId", "email", "password"]);

    let registeredEmail = "";

    initRegisterAccountIdCheck();
    bindPasswordPolicyField({
      passwordInput: document.getElementById("register-password"),
      checklist: document.getElementById("register-password-policy"),
      contextInput: document.getElementById("auth-modal-register-email"),
      getContext: function () {
        const emailInput = document.getElementById("auth-modal-register-email");
        return { email: emailInput ? emailInput.value.trim() : "" };
      },
    });
    addPasswordToggle(document.getElementById("register-password"));

    bindEnterAdvance(
      registerForm.querySelector('[data-step="accountId"]'),
      registerForm.querySelector('[data-step="accountId"] [data-action="next"]')
    );
    bindEnterAdvance(
      registerForm.querySelector('[data-step="email"]'),
      registerForm.querySelector('[data-step="email"] [data-action="next"]')
    );

    registerForm.querySelectorAll('[data-action="next"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (steps.current() === "email") {
          const emailInput = document.getElementById("auth-modal-register-email");
          const email = emailInput.value.trim();
          if (!email || !EMAIL_FORMAT_RE.test(email)) {
            emailInput.focus();
            return;
          }
        }
        steps.next();
      });
    });

    registerForm.querySelectorAll('[data-action="back"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        steps.back();
      });
    });

    registerForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (steps.current() !== "password") {
        steps.next();
        return;
      }

      clearFormError(registerForm);
      const password = registerForm.querySelector('[name="password"]').value;
      const email = registerForm.querySelector('[name="email"]').value.trim();
      const passwordError = validateNewPassword(password, { email });
      if (passwordError) {
        showFormError(registerForm, passwordError);
        return;
      }

      const tosCheckbox = registerForm.querySelector('[name="tosAccepted"]');
      if (tosCheckbox && !tosCheckbox.checked) {
        showFormError(registerForm, "You must accept the Terms of Service and Privacy Policy.");
        return;
      }

      const submit = registerForm.querySelector('[type="submit"]');
      setButtonLoading(submit, true);

      try {
        await register(email, password, registerForm);
        registeredEmail = email;
        registerForm.hidden = true;
        verifyForm.hidden = false;
        const lead = root.querySelector("#auth-modal-register-verify-lead");
        if (lead) lead.textContent = "Enter the 6-digit code we sent to " + email + ".";
        const firstBox = root.querySelector("#auth-modal-register-verify-boxes .otp-box");
        if (firstBox) firstBox.focus();
      } catch (error) {
        showFormError(registerForm, error.message || "Registration failed.");
      } finally {
        setButtonLoading(submit, false);
      }
    });

    initOtpGroup(root.querySelector("#auth-modal-register-verify-boxes"), verifyForm.querySelector('[name="code"]'));

    verifyForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(verifyForm);
      const code = verifyForm.querySelector('[name="code"]').value.trim();
      const submit = verifyForm.querySelector('[type="submit"]');
      setButtonLoading(submit, true);

      try {
        const { response, data } = await apiRequest("/api/auth/verify", {
          method: "POST",
          body: JSON.stringify({ email: registeredEmail, code }),
        });

        if (!response.ok) {
          throw new Error((data && data.error) || "Verification failed.");
        }

        saveRememberedAccount(data);
        finishAuthModalSuccess(data);
      } catch (error) {
        showFormError(verifyForm, error.message || "Verification failed.");
        setButtonLoading(submit, false);
      }
    });

    const resendBtn = verifyForm.querySelector('[data-action="resend"]');
    if (resendBtn) {
      resendBtn.addEventListener("click", async function () {
        clearFormError(verifyForm);
        clearFormSuccess(verifyForm);
        resendBtn.disabled = true;
        try {
          const { data } = await apiRequest("/api/auth/resend-verification", {
            method: "POST",
            body: JSON.stringify({ email: registeredEmail }),
          });
          showFormSuccess(
            verifyForm,
            (data && data.message) ||
              "If an account exists for that email, a verification code has been sent."
          );
        } catch {
          showFormError(verifyForm, "Could not resend code. Try again later.");
        } finally {
          resendBtn.disabled = false;
        }
      });
    }

    if (switchModeBtn) {
      switchModeBtn.addEventListener("click", function () {
        openAuthModal("login");
      });
    }
  }

  // Shows one dismissible banner per pending legal notice (ToS/privacy/
  // cookie-policy updates the signed-in user hasn't acknowledged yet) --
  // see functions/lib/legal-notices.js. Anonymous visitors never hit this;
  // they only get the plain cookie-consent banner in main.js.
  async function initLegalNotices() {
    if (!getSession().authenticated) return;

    let notices;
    try {
      const { response, data } = await apiRequest("/api/legal-notices/pending", { method: "GET" });
      if (!response.ok || !data || !Array.isArray(data.notices)) return;
      notices = data.notices;
    } catch {
      return;
    }

    if (!notices.length) return;

    let i = 0;
    function showNext() {
      if (i >= notices.length) return;
      const notice = notices[i];

      const banner = document.createElement("div");
      banner.className = "legal-notice-banner";
      banner.setAttribute("role", "dialog");
      banner.setAttribute("aria-label", "Policy update notice");

      const text = document.createElement("p");
      text.className = "legal-notice-banner-text";
      text.innerHTML =
        "We've updated our <strong>" +
        notice.title +
        "</strong>. " +
        notice.summary +
        ' <a href="' +
        notice.url +
        '">Read it</a>';

      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = "legal-notice-banner-ok";
      ok.textContent = "Got it";
      ok.addEventListener("click", async function () {
        ok.disabled = true;
        try {
          await apiRequest("/api/legal-notices/acknowledge", {
            method: "POST",
            body: JSON.stringify({ noticeType: notice.noticeType, version: notice.version }),
          });
        } catch {
          // best-effort -- it'll just show again next load if this failed
        }
        banner.remove();
        i++;
        showNext();
      });

      banner.appendChild(text);
      banner.appendChild(ok);
      document.body.appendChild(banner);
    }

    showNext();
  }

  // Shared with auth-settings.js (Account Settings page only).
  window.KanasakaAuthCore = {
    initOtpGroup,
    setButtonLoading,
    apiRequest,
    getSession,
    login,
    register,
    logout,
    showFormError,
    clearFormError,
    showFormSuccess,
    clearFormSuccess,
    validateNewPassword,
    renderAuthGate,
    updateSession,
    renderAvatarElement,
    applyAccountIdFieldState,
    initThemePicker,
    initMotionPicker,
    setupSteps,
    bindEnterAdvance,
    getSessionCache: function () {
      return sessionCache;
    },
    setSessionCache: function (value) {
      sessionCache = value;
    },
  };

  function initSettingsPage() {
    if (window.KanasakaAuthSettings) window.KanasakaAuthSettings.init();
  }

  window.KanasakaAuth = {
    initSession: initSession,
    initLegalNotices: initLegalNotices,
    getSession: getSession,
    canSeeAccountGated: canSeeAccountGated,
    applyAccountGatedVisibility: applyAccountGatedVisibility,
    updateSession: updateSession,
    login: login,
    register: register,
    logout: logout,
    initProtectedPages: initProtectedPages,
    initAuthForms: initAuthForms,
    initSettingsPage: initSettingsPage,
    openAuthModal: openAuthModal,
  };
})();
