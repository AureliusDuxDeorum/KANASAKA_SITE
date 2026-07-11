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

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
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

  async function login(username, password) {
    const { response, data } = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error((data && data.error) || "Login failed.");
    }

    sessionCache = data;
    return data;
  }

  async function register(username, password) {
    const { response, data } = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error((data && data.error) || "Registration failed.");
    }

    sessionCache = data;
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

  function bindAuthForm(formId, handler) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(form);

      const username = form.querySelector('[name="username"]').value.trim();
      const password = form.querySelector('[name="password"]').value;
      const submit = form.querySelector('[type="submit"]');

      submit.disabled = true;

      try {
        await handler(username, password);
        window.location.href = getNextPath();
      } catch (error) {
        showFormError(form, error.message || "Request failed.");
        submit.disabled = false;
      }
    });
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
  }

  function initAuthForms() {
    bindAuthForm("login-form", login);
    bindAuthForm("register-form", register);
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
