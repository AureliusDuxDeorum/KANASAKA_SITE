(function () {
  let sessionCache = null;

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

  async function login(email, password) {
    const { response, data } = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
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

  function bindEmailPasswordForm(formId, handler, options) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(form);
      clearFormSuccess(form);

      const email = form.querySelector('[name="email"]').value.trim();
      const passwordField = form.querySelector('[name="password"]');
      const password = passwordField ? passwordField.value : "";
      const submit = form.querySelector('[type="submit"]');
      const defaultLabel = submit.textContent;

      if (formId === "register-form") {
        const passwordError = validateNewPassword(password, { email });
        if (passwordError) {
          showFormError(form, passwordError);
          return;
        }

        const tosCheckbox = form.querySelector('[name="tosAccepted"]');
        if (tosCheckbox && !tosCheckbox.checked) {
          showFormError(
            form,
            "You must accept the Terms of Service and Privacy Policy."
          );
          return;
        }
      }

      submit.disabled = true;
      submit.textContent = "Please wait...";

      try {
        const result = await handler(email, password, form);
        if (options && options.onSuccess) {
          options.onSuccess(result, form);
          submit.disabled = false;
          submit.textContent = defaultLabel;
          return;
        }
        window.location.href = getNextPath();
      } catch (error) {
        showFormError(form, error.message || "Request failed.");
        submit.disabled = false;
        submit.textContent = defaultLabel;
      }
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

        showFormSuccess(form, data.message);
        form.querySelector('[name="email"]').value = "";
      } catch (error) {
        showFormError(form, error.message || "Request failed.");
      } finally {
        submit.disabled = false;
      }
    });
  }

  function bindResetPasswordForm() {
    const form = document.getElementById("reset-password-form");
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(form);

      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const password = form.querySelector('[name="password"]').value;
      const submit = form.querySelector('[type="submit"]');

      if (!token) {
        showFormError(form, "Reset link is invalid or missing.");
        return;
      }

      const passwordError = validateNewPassword(password);
      if (passwordError) {
        showFormError(form, passwordError);
        return;
      }

      submit.disabled = true;

      try {
        const { response, data } = await apiRequest("/api/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password }),
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
  }

  async function initVerifyPage() {
    const box = document.getElementById("verify-status");
    if (!box) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      box.textContent = "Verification link is invalid or missing.";
      return;
    }

    box.textContent = "Verifying your email address...";

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token }),
      });
      const data = await response.json();

      if (!response.ok) {
        box.textContent = (data && data.error) || "Verification failed.";
        return;
      }

      sessionCache = data;
      box.textContent = "Email verified. Redirecting...";
      window.setTimeout(function () {
        window.location.href = getNextPath() === "/" ? "/downloads/" : getNextPath();
      }, 1500);
    } catch {
      box.textContent = "Verification failed. Try again later.";
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
        '<span class="platform-file">app-debug.apk · ~7.6 MB</span>' +
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
    if (mobileActions && canSeeAccountGated("ks_dev")) {
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

    if (canSeeAccountGated("ks_dev")) {
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
    bindEmailPasswordForm("login-form", login);
    bindEmailPasswordForm("register-form", register, {
      onSuccess: function (result, form) {
        showFormSuccess(
          form,
          result.message ||
            "Check your email to confirm your account before signing in."
        );
        form.querySelector('[name="password"]').value = "";
      },
    });
    bindForgotPasswordForm();
    bindResetPasswordForm();
    initPasswordPolicyFields();
    initRegisterAccountIdCheck();
    initAuthPageMotion();
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
  };
})();
