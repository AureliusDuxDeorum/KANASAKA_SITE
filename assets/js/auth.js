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
      const response = await fetch(
        "/api/auth/verify?token=" + encodeURIComponent(token),
        { credentials: "include" }
      );
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
    container.innerHTML =
      '<a class="button" href="/api/download/windows">Download for Windows</a>' +
      '<a class="button secondary" href="/api/download/linux">Download for Linux .deb</a>';
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
    login: login,
    register: register,
    logout: logout,
    initProtectedPages: initProtectedPages,
    initAuthForms: initAuthForms,
  };
})();
