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

  async function register(email, password) {
    const { response, data } = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
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

  function renderContactDetails(container, contact) {
    container.innerHTML =
      '<div class="contact-item">' +
      "<dt>Email</dt>" +
      '<dd><a href="mailto:' +
      contact.email +
      '">' +
      contact.email +
      "</a></dd>" +
      "</div>" +
      '<div class="contact-item">' +
      "<dt>Telephone</dt>" +
      '<dd><a href="' +
      contact.phoneHref +
      '">' +
      contact.phone +
      "</a></dd>" +
      '<dd class="contact-note">' +
      contact.hours +
      "</dd>" +
      "</div>";
    container.hidden = false;
  }

  function renderDownloadActions(container) {
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
    const actions = document.getElementById("download-actions");
    if (!gate || !actions) return;

    const session = getSession();
    if (!session.authenticated) {
      renderAuthGate(
        "auth-gate-downloads",
        "Downloads require a free KANASAKA account."
      );
      actions.hidden = true;
      return;
    }

    gate.hidden = true;
    renderDownloadActions(actions);
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
      showFormError(profileForm, error.message || "Could not load settings.");
      return;
    }

    displayNameInput.value = profile.displayName || "";
    emailInput.value = profile.email || "";
    renderAvatarElement(avatarBox, profile);
    avatarRemove.hidden = !profile.hasAvatar;

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
          }),
        });

        if (!response.ok) {
          throw new Error((data && data.error) || "Save failed.");
        }

        profile = Object.assign({ authenticated: true }, data);
        updateSession(profile);
        displayNameInput.value = profile.displayName || "";
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
    }
  }

  function showSettingsPanel(panelId) {
    const nav = document.getElementById("settings-nav");
    if (!nav) return;

    nav.querySelectorAll("[data-settings-panel]").forEach(function (button) {
      const active = button.getAttribute("data-settings-panel") === panelId;
      button.classList.toggle("is-active", active);
    });

    document.querySelectorAll(".settings-panel").forEach(function (panel) {
      const active = panel.id === "settings-panel-" + panelId;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
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

  function initProtectedPages() {
    const path = window.location.pathname;

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
  }

  window.KanasakaAuth = {
    initSession: initSession,
    getSession: getSession,
    updateSession: updateSession,
    login: login,
    register: register,
    logout: logout,
    initProtectedPages: initProtectedPages,
    initAuthForms: initAuthForms,
    initSettingsPage: initSettingsPage,
  };
})();
