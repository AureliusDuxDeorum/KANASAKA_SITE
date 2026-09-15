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

  const KS_SPINNER_HTML =
    '<span class="ks-spinner" role="status" aria-label="Loading">' +
    '<span class="ks-spinner-bars">' +
    '<span class="ks-spinner-side"><span></span><span></span></span>' +
    '<span class="ks-spinner-side"><span></span><span></span></span>' +
    "</span>" +
    '<span class="ks-spinner-letters"><span>K</span><span>S</span></span>' +
    "</span>";

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

  function getNextPath() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (!next || !next.startsWith("/") || next.startsWith("//")) {
      return "/";
    }
    return next;
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
      tosVersion: "2",
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

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
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
          window.location.href = getNextPath() === "/" ? "/downloads/" : getNextPath();
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

  function renderPaywallGate(gateId, message, subscriptionsOpen) {
    const gate = document.getElementById(gateId);
    if (!gate) return;

    const open = subscriptionsOpen === true;
    const label = open ? "KS_Package Required" : "Coming Soon";
    const title = open ? "Subscribe to download" : "Subscriptions paused";
    const actions = open
      ? '<a class="button" href="/account/settings/?section=billing">Subscribe</a>' +
        '<a class="button secondary" href="/products/ks-stocks/">Learn more</a>'
      : '<a class="button secondary" href="/products/ks-stocks/">KS Stocks</a>';

    gate.hidden = false;
    gate.innerHTML =
      '<div class="auth-gate-box">' +
      '<span class="coming-soon-label">' + label + "</span>" +
      "<h2>" + title + "</h2>" +
      "<p>" + message + "</p>" +
      '<div class="auth-gate-actions">' +
      actions +
      "</div></div>";
  }

  function hasDownloadAccess(session) {
    return Boolean(session && session.authenticated && session.ksStocksEntitled);
  }

  function hideDownloadActions() {
    document.querySelectorAll(".download-actions").forEach(function (el) {
      el.hidden = true;
    });
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

  function renderDownloadActions(container, productId) {
    if (productId === "ks-k-mobile") {
      container.innerHTML =
        '<div class="download-platform-grid download-platform-grid-single">' +
        '<article class="download-platform-card">' +
        '<span class="platform-label">Android</span>' +
        '<strong class="platform-title">Debug APK</strong>' +
        '<span class="platform-detail">Private alpha · sideload on Android</span>' +
        '<span class="platform-file">app-debug.apk · ~8.0 MB</span>' +
        '<a class="button" href="/api/download/android">Download</a>' +
        "</article>" +
        "</div>";
      container.hidden = false;
      return;
    }

    const platforms = [
      {
        id: "windows",
        label: "Windows",
        title: "x64 Installer",
        file: "KS.Unify_0.1.0_x64-setup.exe",
        size: "~21 MB",
        detail: "Windows 10/11 · 64-bit",
        primary: true,
      },
      {
        id: "macos",
        label: "macOS",
        title: "Apple Silicon",
        file: "KS.Unify_0.1.0_aarch64.dmg",
        size: "~23 MB",
        detail: "M1 / M2 / M3 · macOS 11+",
        primary: false,
      },
      {
        id: "linux",
        label: "Linux",
        title: "Debian Package",
        file: "KS.Unify_0.1.0_amd64.deb",
        size: "~31 MB",
        detail: "Ubuntu / Debian · amd64",
        primary: false,
      },
    ];

    container.innerHTML =
      '<div class="download-platform-grid">' +
      platforms
        .map(function (platform) {
          const buttonClass = platform.primary ? "button" : "button secondary";
          return (
            '<article class="download-platform-card">' +
            '<span class="platform-label">' +
            platform.label +
            "</span>" +
            "<strong class=\"platform-title\">" +
            platform.title +
            "</strong>" +
            '<span class="platform-detail">' +
            platform.detail +
            "</span>" +
            '<span class="platform-file">' +
            platform.file +
            " · " +
            platform.size +
            "</span>" +
            '<a class="' +
            buttonClass +
            '" href="/api/download/' +
            platform.id +
            '">Download</a>' +
            "</article>"
          );
        })
        .join("") +
      "</div>";
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

  async function initDownloadsPage() {
    const gate = document.getElementById("auth-gate-downloads");
    if (!gate) return;

    applyAccountGatedVisibility(document);

    const session = getSession();
    if (!session.authenticated) {
      renderAuthGate(
        "auth-gate-downloads",
        "Downloads require a KANASAKA account."
      );
      hideDownloadActions();
      return;
    }

    if (!hasDownloadAccess(session)) {
      const pausedMessage =
        session.subscriptionsPausedMessage ||
        "KS_Package subscriptions are temporarily unavailable while KS Stocks completes approval.";
      const paywallMessage = session.subscriptionsOpen === true
        ? "Product downloads are included with KS_Package (€10/month or €100/year). Subscribe to unlock KS Unify and other builds. KS Stocks also requires your own Alpaca and Ollama accounts."
        : pausedMessage + " KS Stocks requires separate Alpaca and Ollama accounts when it launches.";
      renderPaywallGate(
        "auth-gate-downloads",
        paywallMessage,
        session.subscriptionsOpen === true
      );
      hideDownloadActions();
      return;
    }

    gate.hidden = true;

    const unifyActions = document.getElementById("download-actions-unify");
    if (unifyActions) {
      renderDownloadActions(unifyActions, "ks-unify");
    }

    const mobileActions = document.getElementById("download-actions-ks-k-mobile");
    if (mobileActions && canSeeAccountGated("dev_ks")) {
      renderDownloadActions(mobileActions, "ks-k-mobile");
    }
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

  function initSettingsAccountIdCheck(input, status, currentAccountId) {
    if (!input || !status) {
      return;
    }

    var timer = null;

    function setStatus(message, isError) {
      status.textContent = message;
      status.hidden = !message;
      status.classList.toggle("is-error", Boolean(isError));
      status.classList.toggle("is-ok", Boolean(message) && !isError);
    }

    input.addEventListener("input", function () {
      if (input.disabled) {
        return;
      }

      window.clearTimeout(timer);
      const value = input.value.trim().toLowerCase();
      if (!value) {
        setStatus("", false);
        return;
      }

      if (currentAccountId && value === String(currentAccountId).toLowerCase()) {
        setStatus("This is your current account ID.", false);
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

  function initTwoFactorSettings(profile) {
    const statusEl = document.getElementById("settings-2fa-status");
    const offBox = document.getElementById("settings-2fa-off");
    const onBox = document.getElementById("settings-2fa-on");
    if (!statusEl || !offBox || !onBox) return;

    const setupStartBtn = document.getElementById("settings-2fa-setup-start");
    const setupForm = document.getElementById("settings-2fa-setup-form");
    const setupResendBtn = document.getElementById("settings-2fa-setup-resend");
    const disableStartBtn = document.getElementById("settings-2fa-disable-start");
    const disableForm = document.getElementById("settings-2fa-disable-form");
    const disableResendBtn = document.getElementById("settings-2fa-disable-resend");

    function render() {
      setupForm.hidden = true;
      disableForm.hidden = true;

      if (profile.twoFactorEnabled) {
        statusEl.textContent = "Enabled.";
        offBox.hidden = true;
        onBox.hidden = false;
      } else {
        statusEl.textContent = "Currently off.";
        offBox.hidden = false;
        onBox.hidden = true;
      }
    }

    initOtpGroup(document.getElementById("settings-2fa-setup-code-boxes"), setupForm.querySelector('[name="code"]'));
    initOtpGroup(document.getElementById("settings-2fa-disable-code-boxes"), disableForm.querySelector('[name="code"]'));

    render();

    setupStartBtn.addEventListener("click", async function () {
      setupStartBtn.disabled = true;
      try {
        const { response, data } = await apiRequest("/api/account/two-factor/email-setup", {
          method: "POST",
        });
        setupForm.hidden = false;
        if (!response.ok) {
          showFormError(setupForm, (data && data.error) || "Could not send code.");
        } else {
          showFormSuccess(setupForm, data.message || "Code sent.");
        }
      } finally {
        setupStartBtn.disabled = false;
      }
    });

    setupResendBtn.addEventListener("click", async function () {
      clearFormError(setupForm);
      clearFormSuccess(setupForm);
      setupResendBtn.disabled = true;
      try {
        const { response, data } = await apiRequest("/api/account/two-factor/email-setup", {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error((data && data.error) || "Could not resend code.");
        }
        showFormSuccess(setupForm, data.message || "Code sent.");
      } catch (error) {
        showFormError(setupForm, error.message || "Could not resend code.");
      } finally {
        setupResendBtn.disabled = false;
      }
    });

    setupForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(setupForm);
      clearFormSuccess(setupForm);

      const code = setupForm.querySelector('[name="code"]').value.trim();
      const submit = setupForm.querySelector('[type="submit"]');
      submit.disabled = true;

      try {
        const { response, data } = await apiRequest("/api/account/two-factor/email-enable", {
          method: "POST",
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          throw new Error((data && data.error) || "Could not enable two-factor authentication.");
        }

        profile.twoFactorEnabled = true;
        profile.emailMasked = data.emailMasked || profile.emailMasked;
        updateSession(Object.assign({}, getSession(), { twoFactorEnabled: true }));
        render();
      } catch (error) {
        showFormError(setupForm, error.message || "Could not enable two-factor authentication.");
      } finally {
        submit.disabled = false;
      }
    });

    disableStartBtn.addEventListener("click", async function () {
      disableStartBtn.disabled = true;
      try {
        const { response, data } = await apiRequest("/api/account/two-factor/send-code", {
          method: "POST",
          body: JSON.stringify({ purpose: "disable" }),
        });
        disableForm.hidden = false;
        if (!response.ok) {
          showFormError(disableForm, (data && data.error) || "Could not send code.");
        } else {
          showFormSuccess(disableForm, data.message || "Code sent.");
        }
      } finally {
        disableStartBtn.disabled = false;
      }
    });

    disableResendBtn.addEventListener("click", async function () {
      clearFormError(disableForm);
      clearFormSuccess(disableForm);
      disableResendBtn.disabled = true;
      try {
        const { response, data } = await apiRequest("/api/account/two-factor/send-code", {
          method: "POST",
          body: JSON.stringify({ purpose: "disable" }),
        });
        if (!response.ok) {
          throw new Error((data && data.error) || "Could not resend code.");
        }
        showFormSuccess(disableForm, data.message || "Code sent.");
      } catch (error) {
        showFormError(disableForm, error.message || "Could not resend code.");
      } finally {
        disableResendBtn.disabled = false;
      }
    });

    disableForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(disableForm);
      clearFormSuccess(disableForm);

      const code = disableForm.querySelector('[name="code"]').value.trim();
      const submit = disableForm.querySelector('[type="submit"]');
      submit.disabled = true;

      try {
        const { response, data } = await apiRequest("/api/account/two-factor/disable", {
          method: "POST",
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          throw new Error((data && data.error) || "Could not disable two-factor authentication.");
        }

        showFormSuccess(disableForm, (data.message || "Two-factor authentication disabled.") + " Redirecting to log in...");
        window.setTimeout(function () {
          window.location.href = "/login/";
        }, 1800);
      } catch (error) {
        showFormError(disableForm, error.message || "Could not disable two-factor authentication.");
        submit.disabled = false;
      }
    });
  }

  async function initSettingsPage() {
    const gate = document.getElementById("settings-gate");
    const content = document.getElementById("settings-content");
    if (!gate || !content) return;

    initSettingsNavigation();

    const session = getSession();
    const sidebar = document.querySelector(".settings-sidebar");

    if (!session.authenticated) {
      if (sidebar) sidebar.hidden = true;
      gate.hidden = false;
      renderAuthGate(
        "settings-gate",
        "Log in to manage your account settings."
      );
      content.hidden = true;
      return;
    }

    if (sidebar) sidebar.hidden = false;
    gate.hidden = true;
    content.hidden = false;

    const avatarBox = document.getElementById("settings-avatar");
    const avatarInput = document.getElementById("settings-avatar-input");
    const avatarRemove = document.getElementById("settings-avatar-remove");
    const profileForm = document.getElementById("settings-profile-form");
    const passwordForm = document.getElementById("settings-password-form");
    const deleteForm = document.getElementById("settings-delete-form");
    const displayNameInput = document.getElementById("settings-display-name");
    const accountIdInput = document.getElementById("settings-account-id");
    const accountIdHint = document.getElementById("settings-account-id-hint");
    const accountIdStatus = document.getElementById("settings-account-id-status");
    const emailInput = document.getElementById("settings-email");

    let profile = session;

    try {
      const { response, data } = await apiRequest("/api/account/profile", {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error((data && data.error) || "Could not load settings.");
      }

      profile = Object.assign({ authenticated: true }, data);
      updateSession(profile);
    } catch (error) {
      if (profileForm) {
        showFormError(profileForm, error.message || "Could not load settings.");
      }
    }

    if (displayNameInput) {
      displayNameInput.value = profile.displayName || "";
    }
    if (accountIdInput) {
      applyAccountIdFieldState(profile, accountIdInput, accountIdHint);
      initSettingsAccountIdCheck(
        accountIdInput,
        accountIdStatus,
        profile.accountId
      );
    }
    if (emailInput) {
      emailInput.value = profile.email || "";
      emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (avatarBox) {
      renderAvatarElement(avatarBox, profile);
    }
    if (avatarRemove) {
      avatarRemove.hidden = !profile.hasAvatar;
    }

    initThemePicker();

    avatarInput.addEventListener("change", async function () {
      const file = avatarInput.files && avatarInput.files[0];
      if (!file) return;

      clearFormError(profileForm);
      clearFormSuccess(profileForm);
      avatarRemove.disabled = true;

      const formData = new FormData();
      formData.append("avatar", file);

      try {
        const response = await fetch("/api/account/avatar", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error((data && data.error) || "Upload failed.");
        }

        profile = Object.assign({ authenticated: true }, data);
        updateSession(profile);
        renderAvatarElement(avatarBox, profile);
        avatarRemove.hidden = false;
        showFormSuccess(profileForm, data.message || "Profile picture updated.");
      } catch (error) {
        showFormError(profileForm, error.message || "Upload failed.");
      } finally {
        avatarInput.value = "";
        avatarRemove.disabled = false;
      }
    });

    avatarRemove.addEventListener("click", async function () {
      clearFormError(profileForm);
      clearFormSuccess(profileForm);
      avatarRemove.disabled = true;

      try {
        const response = await fetch("/api/account/avatar", {
          method: "DELETE",
          credentials: "include",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error((data && data.error) || "Remove failed.");
        }

        profile = Object.assign({ authenticated: true }, data);
        updateSession(profile);
        renderAvatarElement(avatarBox, profile);
        avatarRemove.hidden = true;
        showFormSuccess(profileForm, data.message || "Profile picture removed.");
      } catch (error) {
        showFormError(profileForm, error.message || "Remove failed.");
      } finally {
        avatarRemove.disabled = false;
      }
    });

    profileForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(profileForm);
      clearFormSuccess(profileForm);

      const submit = profileForm.querySelector('[type="submit"]');
      submit.disabled = true;

      try {
        const { response, data } = await apiRequest("/api/account/profile", {
          method: "PATCH",
          body: JSON.stringify({
            displayName: displayNameInput.value.trim(),
            accountId: accountIdInput ? accountIdInput.value.trim() : undefined,
          }),
        });

        if (!response.ok) {
          throw new Error((data && data.error) || "Save failed.");
        }

        profile = Object.assign({ authenticated: true }, data);
        updateSession(profile);
        displayNameInput.value = profile.displayName || "";
        applyAccountIdFieldState(profile, accountIdInput, accountIdHint);
        showFormSuccess(profileForm, data.message || "Profile updated.");
      } catch (error) {
        showFormError(profileForm, error.message || "Save failed.");
      } finally {
        submit.disabled = false;
      }
    });

    passwordForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(passwordForm);
      clearFormSuccess(passwordForm);

      const submit = passwordForm.querySelector('[type="submit"]');
      const newPassword = passwordForm.querySelector('[name="newPassword"]').value;
      const passwordError = validateNewPassword(newPassword, {
        email: emailInput.value.trim(),
      });

      if (passwordError) {
        showFormError(passwordForm, passwordError);
        return;
      }

      submit.disabled = true;

      try {
        const { response, data } = await apiRequest("/api/account/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: passwordForm.querySelector('[name="currentPassword"]').value,
            newPassword: passwordForm.querySelector('[name="newPassword"]').value,
          }),
        });

        if (!response.ok) {
          throw new Error((data && data.error) || "Password update failed.");
        }

        passwordForm.reset();
        showFormSuccess(passwordForm, data.message || "Password updated.");
      } catch (error) {
        showFormError(passwordForm, error.message || "Password update failed.");
      } finally {
        submit.disabled = false;
      }
    });

    initTwoFactorSettings(profile);

    deleteForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(deleteForm);
      clearFormSuccess(deleteForm);

      const submit = deleteForm.querySelector('[type="submit"]');
      submit.disabled = true;

      try {
        const { response, data } = await apiRequest("/api/account/delete", {
          method: "POST",
          body: JSON.stringify({
            password: deleteForm.querySelector('[name="password"]').value,
            confirmation: deleteForm.querySelector('[name="confirmation"]').value,
          }),
        });

        if (!response.ok) {
          throw new Error((data && data.error) || "Account deletion failed.");
        }

        sessionCache = { authenticated: false };
        window.location.href = "/";
      } catch (error) {
        showFormError(deleteForm, error.message || "Account deletion failed.");
        submit.disabled = false;
      }
    });

    const logoutButton = document.getElementById("settings-logout-button");
    if (logoutButton) {
      logoutButton.addEventListener("click", async function () {
        logoutButton.disabled = true;
        await logout();
        window.location.href = "/";
      });
    }

    initBillingPanel();
  }

  function formatBillingDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function setBillingMessage(message, isError) {
    const node = document.getElementById("billing-status-message");
    if (!node) return;
    if (!message) {
      node.hidden = true;
      node.textContent = "";
      node.classList.remove("is-error");
      return;
    }
    node.hidden = false;
    node.textContent = message;
    node.classList.toggle("is-error", Boolean(isError));
  }

  async function startBillingCheckout(plan, button) {
    if (button) button.disabled = true;
    setBillingMessage("");

    try {
      const { response, data } = await apiRequest("/api/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: plan }),
      });

      if (!response.ok) {
        throw new Error((data && data.error) || "Could not start checkout.");
      }

      if (data && data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("Could not start checkout.");
    } catch (error) {
      setBillingMessage(error.message || "Could not start checkout.", true);
      if (button) button.disabled = false;
    }
  }

  async function openBillingPortal(button) {
    if (button) button.disabled = true;
    setBillingMessage("");

    try {
      const { response, data } = await apiRequest("/api/stripe/portal", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error((data && data.error) || "Could not open billing portal.");
      }

      if (data && data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("Could not open billing portal.");
    } catch (error) {
      setBillingMessage(error.message || "Could not open billing portal.", true);
      if (button) button.disabled = false;
    }
  }

  function renderBillingPanel(data) {
    const unconfigured = document.getElementById("billing-unconfigured");
    const paused = document.getElementById("billing-paused");
    const developer = document.getElementById("billing-developer");
    const active = document.getElementById("billing-active");
    const subscribe = document.getElementById("billing-subscribe");
    const badge = document.getElementById("billing-status-badge");
    const renews = document.getElementById("billing-renews");
    const portalButton = document.getElementById("billing-portal-button");

    [unconfigured, paused, developer, active, subscribe].forEach(function (node) {
      if (node) node.hidden = true;
    });

    if (!data || !data.configured) {
      if (unconfigured) unconfigured.hidden = false;
      return;
    }

    if (data.ksStocksAccessReason === "developer") {
      if (developer) developer.hidden = false;
      return;
    }

    if (data.ksStocksEntitled) {
      if (active) active.hidden = false;
      if (badge) {
        badge.textContent =
          data.subscriptionStatus === "trialing" ? "Trialing" : "Active";
        badge.classList.add("billing-badge-active");
      }
      if (renews) {
        const renewDate = formatBillingDate(data.subscriptionEndsAt);
        if (renewDate) {
          renews.hidden = false;
          renews.textContent = "Current period ends " + renewDate + ".";
        } else {
          renews.hidden = true;
          renews.textContent = "";
        }
      }
      if (portalButton) {
        portalButton.hidden = !data.stripeCustomerId;
      }
      return;
    }

    if (data.subscriptionsOpen === false) {
      if (paused) {
        paused.hidden = false;
        const copy = paused.querySelector("[data-billing-paused-copy]");
        if (copy) {
          copy.textContent =
            data.subscriptionsPausedMessage ||
            "KS_Package subscriptions are temporarily unavailable while KS Stocks completes approval.";
        }
      }
      return;
    }

    if (subscribe) subscribe.hidden = false;
  }

  async function initBillingPanel() {
    const panel = document.getElementById("settings-panel-billing");
    if (!panel) return;

    const params = new URLSearchParams(window.location.search);
    const billingResult = params.get("billing");
    if (billingResult === "success") {
      setBillingMessage("Subscription updated. KS Stocks access should be active shortly.");
    } else if (billingResult === "cancel") {
      setBillingMessage("Checkout was canceled.", true);
    }

    document.querySelectorAll("[data-billing-plan]").forEach(function (button) {
      button.addEventListener("click", function () {
        startBillingCheckout(button.getAttribute("data-billing-plan"), button);
      });
    });

    const portalButton = document.getElementById("billing-portal-button");
    if (portalButton) {
      portalButton.addEventListener("click", function () {
        openBillingPortal(portalButton);
      });
    }

    try {
      const { response, data } = await apiRequest("/api/billing/status", {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error((data && data.error) || "Could not load billing.");
      }

      renderBillingPanel(data);
      if (data && typeof data.ksStocksEntitled === "boolean") {
        updateSession(Object.assign({}, getSession(), data));
      }
    } catch (error) {
      setBillingMessage(error.message || "Could not load billing.", true);
    }
  }

  function initSettingsNavigation() {
    const nav = document.getElementById("settings-nav");
    if (!nav) return;

    nav.querySelectorAll("[data-settings-panel]").forEach(function (button) {
      button.addEventListener("click", function () {
        showSettingsPanel(button.getAttribute("data-settings-panel"));
      });
    });

    const params = new URLSearchParams(window.location.search);
    const panel = params.get("section");
    if (panel) {
      showSettingsPanel(panel);
      return;
    }

    if (window.location.hash === "#billing") {
      showSettingsPanel("billing");
    }
  }

  let settingsPanelTimer = null;

  function showSettingsPanel(panelId) {
    const nav = document.getElementById("settings-nav");
    if (!nav) return;

    const targetId = "settings-panel-" + panelId;
    const current = document.querySelector(".settings-panel.is-active");
    const next = document.getElementById(targetId);

    if (current && current.id === targetId) {
      return;
    }

    nav.querySelectorAll("[data-settings-panel]").forEach(function (button) {
      const active = button.getAttribute("data-settings-panel") === panelId;
      button.classList.toggle("is-active", active);
    });

    if (settingsPanelTimer) {
      window.clearTimeout(settingsPanelTimer);
      settingsPanelTimer = null;
    }

    function revealPanel(panel) {
      panel.hidden = false;
      panel.classList.add("is-entering");
      window.requestAnimationFrame(function () {
        panel.classList.add("is-active");
        panel.classList.remove("is-entering");
      });
    }

    if (!current || !next) {
      document.querySelectorAll(".settings-panel").forEach(function (panel) {
        const active = panel.id === targetId;
        panel.hidden = !active;
        panel.classList.toggle("is-active", active);
        panel.classList.remove("is-leaving", "is-entering");
      });
      return;
    }

    current.classList.add("is-leaving");
    current.classList.remove("is-active");

    settingsPanelTimer = window.setTimeout(function () {
      current.hidden = true;
      current.classList.remove("is-leaving");
      revealPanel(next);
      settingsPanelTimer = null;
    }, 280);
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

  async function initKskMobilePage() {
    const content = document.getElementById("ks-k-mobile-content");
    const gate = document.getElementById("ks-k-mobile-gate");
    if (!content || !gate) {
      return;
    }

    applyAccountGatedVisibility(document);

    if (canSeeAccountGated("dev_ks")) {
      gate.hidden = true;
      return;
    }

    content.hidden = true;
    gate.hidden = false;
  }

  function initProtectedPages() {
    applyAccountGatedVisibility(document);

    const path = window.location.pathname;

    if (path.indexOf("/products/ks-k-mobile") === 0) {
      initKskMobilePage();
    }

    if (path.indexOf("/support/contact") === 0) {
      initContactPage();
    }

    if (path.indexOf("/downloads") === 0) {
      initDownloadsPage();
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
      window.location.href = getNextPath();
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
      '<div class="auth-field">' +
      '<label id="auth-modal-login-verify-label">Verification code</label>' +
      '<div class="otp-boxes" id="auth-modal-login-verify-boxes" role="group" aria-labelledby="auth-modal-login-verify-label"></div>' +
      '<input type="hidden" name="code">' +
      "</div>" +
      '<button type="submit" class="button auth-submit">Verify</button>' +
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
          if (lead) {
            lead.textContent = destination
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

    verifyForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(verifyForm);
      const code = verifyForm.querySelector('[name="code"]').value.trim();
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

  window.KanasakaAuth = {
    initSession: initSession,
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
