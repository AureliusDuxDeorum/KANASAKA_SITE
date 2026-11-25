// Account Settings only (profile, security, 2FA, admin tools). Split out of auth.js so every other
// page does not download it; loaded by account/settings/index.html after auth.js, which hands over
// the shared helpers through window.KanasakaAuthCore.
(function () {
  const core = window.KanasakaAuthCore;
  if (!core) return;
  const {
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
  } = core;

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

  function escapeHtml(value) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return map[ch];
    });
  }

  function initSecurityPhraseSettings() {
    const form = document.getElementById("settings-security-phrase-form");
    if (!form) return;

    const phraseInput = form.querySelector('[name="securityPhrase"]');

    apiRequest("/api/account/security-phrase", { method: "GET" })
      .then(function (result) {
        if (result.response.ok && result.data && result.data.securityPhrase) {
          phraseInput.value = result.data.securityPhrase;
        }
      })
      .catch(function () {
        // Non-critical; the field just stays empty.
      });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(form);
      clearFormSuccess(form);

      const passwordField = form.querySelector('[name="currentPassword"]');
      const submit = form.querySelector('[type="submit"]');
      setButtonLoading(submit, true);

      try {
        const { response, data } = await apiRequest("/api/account/security-phrase", {
          method: "POST",
          body: JSON.stringify({
            securityPhrase: phraseInput.value,
            currentPassword: passwordField.value,
          }),
        });

        if (!response.ok) {
          throw new Error((data && data.error) || "Could not save security phrase.");
        }

        showFormSuccess(form, data.message || "Saved.");
      } catch (error) {
        showFormError(form, error.message || "Could not save security phrase.");
      } finally {
        passwordField.value = "";
        setButtonLoading(submit, false);
      }
    });
  }

  function initDeveloperSettings(profile) {
    const navBtn = document.getElementById("settings-nav-developer");
    const panel = document.getElementById("settings-panel-developer");
    if (!navBtn || !panel) return;

    const isDev = profile.accountId === "dev_ks" || profile.role === "admin";
    navBtn.hidden = !isDev;
    if (!isDev) {
      // initSettingsNavigation() runs before this gate and will happily show
      // the (data-less) panel shell if reached via ?section=developer --
      // force back to a safe default rather than leaving it exposed.
      if (!panel.hidden) {
        showSettingsPanel("personal");
      }
      return;
    }

    const sessionInfo = document.getElementById("settings-dev-session");
    if (sessionInfo) {
      sessionInfo.innerHTML =
        "<dt>Email</dt><dd>" + escapeHtml(profile.email) + "</dd>" +
        "<dt>Account ID</dt><dd>" + escapeHtml(profile.accountId || "—") + "</dd>" +
        "<dt>Role</dt><dd>" + escapeHtml(profile.role || "user") + "</dd>" +
        "<dt>2FA</dt><dd>" +
        (profile.twoFactorEnabled ? "Enabled (" + escapeHtml(profile.twoFactorMethod || "?") + ")" : "Off") +
        "</dd>";
    }

    const lookupForm = document.getElementById("settings-dev-lookup-form");
    const lookupResult = document.getElementById("settings-dev-lookup-result");
    const roleForm = document.getElementById("settings-dev-role-form");
    const roleSelect = document.getElementById("settings-dev-role-select");
    // App devices (KS_C1) signed in to the looked-up account, each with a button to sign it out.
    function appDevicesHtml(devices) {
      if (!devices || !devices.length) return "<dt>App devices</dt><dd>None</dd>";
      return (
        "<dt>App devices</dt><dd>" +
        devices
          .map(function (d) {
            return (
              escapeHtml(d.label || "Unknown device") + " (" + escapeHtml(d.client) + "), last used " + escapeHtml(d.lastUsedAt) +
              ' <button type="button" class="link-button" data-revoke-device="' + escapeHtml(d.id) + '">Sign out</button>'
            );
          })
          .join("<br>") +
        ' <br><button type="button" class="link-button" data-revoke-all-devices="1">Sign out all</button></dd>'
      );
    }

    let lookedUpAccountId = null;
    let lookedUpQuery = "";

    if (lookupForm) {
      lookupForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearFormError(lookupForm);
        const query = lookupForm.querySelector('[name="query"]').value.trim();
        if (!query) return;

        const submit = lookupForm.querySelector('[type="submit"]');
        setButtonLoading(submit, true);

        try {
          const { response, data } = await apiRequest(
            "/api/admin/lookup?q=" + encodeURIComponent(query),
            { method: "GET" }
          );

          if (!response.ok) {
            throw new Error((data && data.error) || "Lookup failed.");
          }

          lookedUpAccountId = data.accountId || null;
          lookedUpQuery = data.email || query;
          lookupResult.hidden = false;
          lookupResult.innerHTML =
            "<dt>Email</dt><dd>" + escapeHtml(data.email) + "</dd>" +
            "<dt>Account ID</dt><dd>" + escapeHtml(data.accountId || "—") + "</dd>" +
            "<dt>Role</dt><dd>" + escapeHtml(data.role || "user") + "</dd>" +
            "<dt>Verified</dt><dd>" + (data.emailVerified ? "Yes" : "No") + "</dd>" +
            "<dt>2FA</dt><dd>" + (data.twoFactorEnabled ? "Enabled" : "Off") + "</dd>" +
            "<dt>Created</dt><dd>" + escapeHtml(data.createdAt) + "</dd>" +
            appDevicesHtml(data.appDevices) +
            (data.pendingRoleChange
              ? "<dt>Pending change</dt><dd>" +
                escapeHtml(data.pendingRoleChange.previousRole) +
                " → " +
                escapeHtml(data.pendingRoleChange.newRole) +
                " at " +
                escapeHtml(data.pendingRoleChange.effectiveAt) +
                " (emailed cancel link)</dd>"
              : "");

          if (lookedUpAccountId) {
            roleForm.hidden = false;
            roleSelect.value = data.role || "user";
          } else {
            roleForm.hidden = true;
          }
        } catch (error) {
          showFormError(lookupForm, error.message || "Lookup failed.");
          lookupResult.hidden = true;
          roleForm.hidden = true;
        } finally {
          setButtonLoading(submit, false);
        }
      });
    }

    if (lookupResult) {
      lookupResult.addEventListener("click", async function (event) {
        const button = event.target.closest("[data-revoke-device],[data-revoke-all-devices]");
        if (!button || !lookedUpQuery) return;
        const all = button.hasAttribute("data-revoke-all-devices");
        button.disabled = true;
        try {
          const { response, data } = await apiRequest("/api/admin/app-devices", {
            method: "POST",
            body: JSON.stringify(
              all ? { q: lookedUpQuery, all: true } : { q: lookedUpQuery, deviceId: button.getAttribute("data-revoke-device") }
            ),
          });
          if (!response.ok) throw new Error((data && data.error) || "Could not sign the device out.");
          // Look the account up again so the list shows what is left.
          if (lookupForm) lookupForm.requestSubmit();
        } catch (error) {
          showFormError(lookupForm, error.message || "Could not sign the device out.");
          button.disabled = false;
        }
      });
    }

    if (roleForm) {
      roleForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearFormError(roleForm);
        clearFormSuccess(roleForm);
        if (!lookedUpAccountId) return;

        const passwordField = roleForm.querySelector('[name="currentPassword"]');
        const submit = roleForm.querySelector('[type="submit"]');
        setButtonLoading(submit, true);

        try {
          const { response, data } = await apiRequest("/api/admin/account-role", {
            method: "POST",
            body: JSON.stringify({
              accountId: lookedUpAccountId,
              role: roleSelect.value,
              currentPassword: passwordField.value,
            }),
          });

          if (!response.ok) {
            throw new Error((data && data.error) || "Role update failed.");
          }

          showFormSuccess(roleForm, data.message || "Role updated.");
        } catch (error) {
          showFormError(roleForm, error.message || "Role update failed.");
        } finally {
          passwordField.value = "";
          setButtonLoading(submit, false);
        }
      });
    }

    const noticeForm = document.getElementById("settings-dev-notice-form");
    if (noticeForm) {
      noticeForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearFormError(noticeForm);
        clearFormSuccess(noticeForm);

        const passwordField = noticeForm.querySelector('[name="currentPassword"]');
        const submit = noticeForm.querySelector('[type="submit"]');
        setButtonLoading(submit, true);

        try {
          const { response, data } = await apiRequest("/api/admin/legal-notices", {
            method: "POST",
            body: JSON.stringify({
              noticeType: noticeForm.querySelector('[name="noticeType"]').value.trim(),
              version: noticeForm.querySelector('[name="version"]').value.trim(),
              title: noticeForm.querySelector('[name="title"]').value.trim(),
              summary: noticeForm.querySelector('[name="summary"]').value.trim(),
              url: noticeForm.querySelector('[name="url"]').value.trim(),
              currentPassword: passwordField.value,
            }),
          });

          if (!response.ok) {
            throw new Error((data && data.error) || "Could not publish notice.");
          }

          showFormSuccess(
            noticeForm,
            "Sent to " + data.sent + " of " + data.recipients + " users" +
              (data.failed ? " (" + data.failed + " failed)" : "") + "."
          );
        } catch (error) {
          showFormError(noticeForm, error.message || "Could not publish notice.");
        } finally {
          passwordField.value = "";
          setButtonLoading(submit, false);
        }
      });
    }

    const eventsBox = document.getElementById("settings-dev-events");
    const eventsRefresh = document.getElementById("settings-dev-events-refresh");

    async function loadEvents() {
      if (!eventsBox) return;
      eventsBox.textContent = "Loading...";

      try {
        const { response, data } = await apiRequest("/api/admin/events?limit=25", { method: "GET" });
        if (!response.ok) {
          throw new Error((data && data.error) || "Could not load events.");
        }

        const events = (data && data.events) || [];
        if (!events.length) {
          eventsBox.textContent = "No events yet.";
          return;
        }

        eventsBox.innerHTML = events
          .map(function (ev) {
            return (
              '<div class="settings-dev-event">' +
              '<span class="settings-dev-event-time">' +
              escapeHtml(ev.created_at) +
              "</span>" +
              '<span class="settings-dev-event-type">' +
              escapeHtml(ev.event_type) +
              "</span>" +
              '<span class="settings-dev-event-meta">' +
              escapeHtml(ev.meta) +
              "</span>" +
              "</div>"
            );
          })
          .join("");
      } catch (error) {
        eventsBox.textContent = error.message || "Could not load events.";
      }
    }

    if (eventsRefresh) {
      eventsRefresh.addEventListener("click", loadEvents);
    }

    initUserCatalogue(navBtn, panel, lookupForm);
    initDiagnostics();

    loadEvents();
  }

  // System status + live self-tests. Both endpoints are audited and rate
  // limited, so nothing loads until the collapsible is opened (status) or the
  // button is pressed (tests). All text goes in via textContent.
  function initDiagnostics() {
    const statusSection = document.getElementById("settings-dev-status-section");
    const statusBox = document.getElementById("settings-dev-status");
    const statusMeta = document.getElementById("settings-dev-status-meta");
    const statusRefresh = document.getElementById("settings-dev-status-refresh");
    const testRun = document.getElementById("settings-dev-selftest-run");
    const testBox = document.getElementById("settings-dev-selftest");
    const testMeta = document.getElementById("settings-dev-selftest-meta");

    const LABELS = { ok: "OK", warn: "WARN", fail: "FAIL", info: "INFO", manual: "MANUAL", pass: "PASS", skip: "SKIP" };

    function row(status, label, detail, trailing) {
      const el = document.createElement("div");
      el.className = "diag-row diag-" + status;

      const badge = document.createElement("span");
      badge.className = "diag-badge";
      badge.textContent = LABELS[status] || status.toUpperCase();

      const name = document.createElement("span");
      name.className = "diag-label";
      name.textContent = label;

      el.appendChild(badge);
      el.appendChild(name);

      if (trailing) {
        const t = document.createElement("span");
        t.className = "diag-time";
        t.textContent = trailing;
        el.appendChild(t);
      }

      if (detail) {
        const d = document.createElement("span");
        d.className = "diag-detail";
        d.textContent = detail;
        el.appendChild(d);
      }
      return el;
    }

    function summaryLine(parts) {
      return parts
        .filter(function (p) { return p[1] > 0 || p[0] === "fail"; })
        .map(function (p) { return p[1] + " " + p[0]; })
        .join("  ·  ");
    }

    async function loadStatus() {
      if (!statusBox) return;
      statusBox.textContent = "Loading...";
      if (statusMeta) statusMeta.textContent = "";

      try {
        const { response, data } = await apiRequest("/api/admin/diagnostics", { method: "GET" });
        if (!response.ok) {
          throw new Error((data && data.error) || "Could not load system status.");
        }

        statusBox.textContent = "";
        (data.groups || []).forEach(function (group) {
          const heading = document.createElement("h4");
          heading.className = "diag-group";
          heading.textContent = group.title;
          statusBox.appendChild(heading);
          (group.checks || []).forEach(function (c) {
            statusBox.appendChild(row(c.status, c.label, c.detail));
          });
        });

        if (statusMeta) {
          const s = data.summary || {};
          statusMeta.textContent =
            summaryLine([["ok", s.ok || 0], ["warn", s.warn || 0], ["fail", s.fail || 0]]) +
            "  ·  checked " + new Date(data.generatedAt).toLocaleTimeString();
        }
      } catch (error) {
        statusBox.textContent = error.message || "Could not load system status.";
      }
    }

    async function runTests() {
      if (!testBox || !testRun) return;
      testRun.disabled = true;
      testBox.textContent = "Running...";
      if (testMeta) testMeta.textContent = "";

      try {
        const { response, data } = await apiRequest("/api/admin/self-test", { method: "POST", body: "{}" });
        if (!response.ok) {
          throw new Error((data && data.error) || "Could not run the self-tests.");
        }

        testBox.textContent = "";
        (data.results || []).forEach(function (r) {
          testBox.appendChild(row(r.status, r.label, r.detail, r.ms + " ms"));
        });

        if (testMeta) {
          const s = data.summary || {};
          testMeta.textContent =
            summaryLine([["pass", s.pass || 0], ["fail", s.fail || 0], ["skip", s.skip || 0]]) +
            "  ·  " + (s.ms || 0) + " ms";
        }
      } catch (error) {
        testBox.textContent = error.message || "Could not run the self-tests.";
      } finally {
        testRun.disabled = false;
      }
    }

    let statusLoaded = false;
    if (statusSection) {
      statusSection.addEventListener("toggle", function () {
        if (statusSection.open && !statusLoaded) {
          statusLoaded = true;
          loadStatus();
        }
      });
    }
    if (statusRefresh) statusRefresh.addEventListener("click", loadStatus);
    if (testRun) testRun.addEventListener("click", runTests);
  }

  // Alphabetical, searchable, role-filterable list of every account. Loaded
  // the first time the Developer tab is opened (not on every settings load)
  // because the endpoint is audited and rate limited.
  function initUserCatalogue(navBtn, panel, lookupForm) {
    const listEl = document.getElementById("settings-dev-catalogue-list");
    const searchEl = document.getElementById("settings-dev-catalogue-search");
    const statusEl = document.getElementById("settings-dev-catalogue-status");
    const refreshBtn = document.getElementById("settings-dev-catalogue-refresh");
    const filterBtns = Array.prototype.slice.call(document.querySelectorAll("[data-role-filter]"));
    if (!listEl || !searchEl || !statusEl) return;

    const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    let users = [];
    let roleFilter = "all";
    let loaded = false;
    let searchTimer = null;

    function label(u) {
      return (u.displayName || "").trim() || u.accountId || u.email;
    }

    function groupLetter(u) {
      const first = label(u).charAt(0).toUpperCase();
      return /[A-Z]/.test(first.normalize("NFD").charAt(0)) ? first.normalize("NFD").charAt(0) : "#";
    }

    function setStatus(text) {
      statusEl.textContent = text;
    }

    function updateCounts() {
      const counts = { all: users.length, admin: 0, beta: 0, user: 0 };
      users.forEach(function (u) {
        if (counts[u.role] !== undefined) counts[u.role] += 1;
      });
      filterBtns.forEach(function (btn) {
        const el = btn.querySelector("[data-count]");
        if (el) el.textContent = String(counts[btn.getAttribute("data-role-filter")] || 0);
      });
    }

    function render() {
      const query = searchEl.value.trim().toLowerCase();
      const shown = users.filter(function (u) {
        if (roleFilter !== "all" && u.role !== roleFilter) return false;
        if (!query) return true;
        return (
          (u.displayName || "").toLowerCase().indexOf(query) !== -1 ||
          (u.accountId || "").toLowerCase().indexOf(query) !== -1 ||
          u.email.toLowerCase().indexOf(query) !== -1
        );
      });

      setStatus(
        shown.length === users.length
          ? users.length + (users.length === 1 ? " user" : " users")
          : "Showing " + shown.length + " of " + users.length
      );

      if (!shown.length) {
        listEl.innerHTML = '<p class="user-catalogue-empty">No users match.</p>';
        return;
      }

      let html = "";
      let currentLetter = null;
      shown.forEach(function (u) {
        const letter = groupLetter(u);
        if (letter !== currentLetter) {
          if (currentLetter !== null) html += "</div>";
          html += '<div class="user-catalogue-group"><div class="user-catalogue-letter">' + escapeHtml(letter) + "</div>";
          currentLetter = letter;
        }
        const lookupKey = u.accountId || u.email;
        html +=
          '<button type="button" class="user-catalogue-user' + (u.role === "admin" ? " is-admin" : "") +
          '" data-lookup="' + escapeHtml(lookupKey) + '">' +
          '<span class="user-catalogue-line">' +
          '<span class="user-catalogue-name">' + escapeHtml(label(u)) + "</span>" +
          '<span class="user-catalogue-badge user-catalogue-badge--' + escapeHtml(u.role) + '">' + escapeHtml(u.role) + "</span>" +
          "</span>" +
          '<span class="user-catalogue-meta">' + escapeHtml(u.email) +
          (u.accountId ? " · " + escapeHtml(u.accountId) : "") + "</span>" +
          '<span class="user-catalogue-extra">' +
          (u.emailVerified ? "Verified" : "Unverified") +
          " · 2FA " + (u.twoFactorEnabled ? "on" : "off") +
          " · joined " + escapeHtml(String(u.createdAt || "").slice(0, 10)) +
          "</span></button>";
      });
      if (currentLetter !== null) html += "</div>";
      listEl.innerHTML = html;
    }

    async function load() {
      setStatus("Loading…");
      listEl.innerHTML = "";
      try {
        const { response, data } = await apiRequest("/api/admin/users", { method: "GET" });
        if (!response.ok) {
          throw new Error((data && data.error) || "Could not load users.");
        }
        users = ((data && data.users) || []).slice().sort(function (a, b) {
          return collator.compare(label(a), label(b)) || collator.compare(a.email, b.email);
        });
        loaded = true;
        updateCounts();
        render();
      } catch (error) {
        users = [];
        updateCounts();
        setStatus(error.message || "Could not load users.");
      }
    }

    searchEl.addEventListener("input", function () {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(render, 80);
    });

    filterBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        roleFilter = btn.getAttribute("data-role-filter");
        filterBtns.forEach(function (other) {
          const on = other === btn;
          other.classList.toggle("is-active", on);
          other.setAttribute("aria-pressed", on ? "true" : "false");
        });
        render();
      });
    });

    // Picking a user runs the existing Account Lookup (where roles are changed).
    listEl.addEventListener("click", function (event) {
      const row = event.target.closest("[data-lookup]");
      if (!row || !lookupForm) return;
      const input = lookupForm.querySelector('[name="query"]');
      input.value = row.getAttribute("data-lookup");
      lookupForm.scrollIntoView({ behavior: "smooth", block: "center" });
      if (lookupForm.requestSubmit) {
        lookupForm.requestSubmit();
      } else {
        lookupForm.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });

    if (refreshBtn) {
      refreshBtn.addEventListener("click", load);
    }

    function loadOnce() {
      if (!loaded) load();
    }

    navBtn.addEventListener("click", loadOnce);
    if (!panel.hidden) loadOnce();
  }

  // Draws `text` as a QR code into `container` (an inline SVG built from DOM
  // nodes, so it needs no inline styles). Returns false when the encoder
  // (assets/js/qrcode.js) isn't available.
  function renderQrCode(container, text) {
    if (typeof window.qrcode !== "function") return false;

    const qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();

    const size = qr.getModuleCount();
    const quiet = 4;
    const ns = "http://www.w3.org/2000/svg";
    let path = "";
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (qr.isDark(row, col)) path += "M" + col + " " + row + "h1v1h-1z";
      }
    }

    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", -quiet + " " + -quiet + " " + (size + quiet * 2) + " " + (size + quiet * 2));
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "QR code for your authenticator app");
    svg.setAttribute("shape-rendering", "crispEdges");

    const background = document.createElementNS(ns, "rect");
    background.setAttribute("class", "qr-bg");
    background.setAttribute("x", String(-quiet));
    background.setAttribute("y", String(-quiet));
    background.setAttribute("width", String(size + quiet * 2));
    background.setAttribute("height", String(size + quiet * 2));

    const modules = document.createElementNS(ns, "path");
    modules.setAttribute("class", "qr-dark");
    modules.setAttribute("d", path);

    svg.appendChild(background);
    svg.appendChild(modules);
    container.replaceChildren(svg);
    return true;
  }

  function initTwoFactorSettings(profile) {
    const statusEl = document.getElementById("settings-2fa-status");
    const onBox = document.getElementById("settings-2fa-on");
    if (!statusEl || !onBox) return;

    const byId = function (id) { return document.getElementById(id); };
    const backupBox = byId("settings-2fa-backup-codes");
    const backupList = byId("settings-2fa-backup-codes-list");
    const backupDismissBtn = byId("settings-2fa-backup-codes-dismiss");
    const backupRemainingEl = byId("settings-2fa-backup-remaining");
    const regenerateStartBtn = byId("settings-2fa-regenerate-start");
    const regenerateForm = byId("settings-2fa-regenerate-form");

    // Email card
    const emailStateEl = byId("settings-2fa-email-state");
    const emailDescEl = byId("settings-2fa-email-desc");
    const emailStartBtn = byId("settings-2fa-setup-start");
    const emailForm = byId("settings-2fa-setup-form");
    const emailRemoveBtn = byId("settings-2fa-disable-start");
    const emailRemoveForm = byId("settings-2fa-disable-form");

    // Authenticator card
    const totpStateEl = byId("settings-2fa-totp-state");
    const totpStartBtn = byId("settings-2fa-totp-start");
    const totpRemoveBtn = byId("settings-2fa-totp-remove-start");
    const totpForm = byId("settings-2fa-totp-form");
    const totpRemoveForm = byId("settings-2fa-totp-remove-form");
    const totpQrEl = byId("settings-2fa-totp-qr");
    const totpSecretEl = byId("settings-2fa-totp-secret");
    const totpCopyBtn = byId("settings-2fa-totp-copy");
    const totpCopyStatusEl = byId("settings-2fa-totp-copy-status");

    if (!emailForm || !emailRemoveForm || !totpForm || !totpRemoveForm) return;

    let totpSecret = "";
    let copyTimer = null;

    function methods() {
      if (Array.isArray(profile.twoFactorMethods)) return profile.twoFactorMethods;
      return profile.twoFactorEnabled ? [profile.twoFactorMethod || "email"] : [];
    }

    function setMethods(list) {
      profile.twoFactorMethods = list;
      profile.twoFactorMethod = list[0] || null;
      profile.twoFactorEnabled = list.length > 0;
      updateSession(Object.assign({}, getSession(), { twoFactorEnabled: list.length > 0 }));
    }

    function addMethod(name) {
      const list = methods().filter(function (m) { return m !== name; });
      list.push(name);
      list.sort(function (x, y) { return (x === "totp" ? 0 : 1) - (y === "totp" ? 0 : 1); });
      setMethods(list);
    }

    function showBackupCodes(codes) {
      if (!backupBox || !backupList || !Array.isArray(codes)) return;
      backupList.textContent = codes.join("\n");
      backupBox.hidden = false;
    }

    function clearTotpSetup() {
      totpSecret = "";
      totpForm.hidden = true;
      totpQrEl.textContent = "";
      totpSecretEl.textContent = "";
      if (totpCopyStatusEl) totpCopyStatusEl.hidden = true;
      if (totpCopyBtn) totpCopyBtn.classList.remove("is-copied");
    }

    function closeForms() {
      emailForm.hidden = true;
      emailRemoveForm.hidden = true;
      totpRemoveForm.hidden = true;
      if (regenerateForm) regenerateForm.hidden = true;
      clearTotpSetup();
    }

    function render() {
      closeForms();
      const list = methods();
      const hasTotp = list.indexOf("totp") !== -1;
      const emailLike = list.indexOf("sms") !== -1 ? "sms" : list.indexOf("email") !== -1 ? "email" : null;

      const names = [];
      if (hasTotp) names.push("authenticator app");
      if (emailLike === "email") names.push("email");
      if (emailLike === "sms") names.push("text message");
      statusEl.textContent = names.length ? "Enabled: " + names.join(" and ") + "." : "Currently off.";

      totpStateEl.textContent = hasTotp ? "On" : "Off";
      totpStateEl.classList.toggle("is-on", hasTotp);
      totpStartBtn.hidden = hasTotp;
      totpStartBtn.disabled = emailLike === "sms";
      totpRemoveBtn.hidden = !hasTotp;

      emailStateEl.textContent = emailLike === "sms" ? "On (text message)" : emailLike ? "On" : "Off";
      emailStateEl.classList.toggle("is-on", Boolean(emailLike));
      emailStartBtn.hidden = Boolean(emailLike);
      emailRemoveBtn.hidden = !emailLike;
      if (emailDescEl) {
        emailDescEl.textContent =
          emailLike === "sms"
            ? "We text a 6-digit code to " + (profile.phoneMasked || "your phone") + " each time you log in."
            : "We email a 6-digit code to your account address each time you log in.";
      }

      onBox.hidden = list.length === 0;
      if (backupRemainingEl) {
        const remaining = profile.backupCodesRemaining || 0;
        backupRemainingEl.textContent =
          remaining === 1 ? "1 backup code remaining." : remaining + " backup codes remaining.";
      }
      if (!list.length && backupBox) backupBox.hidden = true;
    }

    const emailCodeGroup = initOtpGroup(byId("settings-2fa-setup-code-boxes"), emailForm.querySelector('[name="code"]'));
    initOtpGroup(byId("settings-2fa-disable-code-boxes"), emailRemoveForm.querySelector('[name="code"]'));
    const totpCodeGroup = initOtpGroup(byId("settings-2fa-totp-code-boxes"), totpForm.querySelector('[name="code"]'));
    initOtpGroup(byId("settings-2fa-totp-remove-code-boxes"), totpRemoveForm.querySelector('[name="code"]'));

    render();

    async function post(path, payload) {
      return apiRequest(path, { method: "POST", body: payload === undefined ? undefined : JSON.stringify(payload) });
    }

    // ---- email: set up -----------------------------------------------------

    emailStartBtn.addEventListener("click", async function () {
      emailStartBtn.disabled = true;
      closeForms();
      try {
        const { response, data } = await post("/api/account/two-factor/email-setup");
        emailForm.hidden = false;
        clearFormError(emailForm);
        clearFormSuccess(emailForm);
        if (!response.ok) {
          showFormError(emailForm, (data && data.error) || "Could not send code.");
        } else {
          showFormSuccess(emailForm, data.message || "Code sent.");
          if (emailCodeGroup) emailCodeGroup.clear();
        }
      } finally {
        emailStartBtn.disabled = false;
      }
    });

    byId("settings-2fa-setup-resend").addEventListener("click", async function (event) {
      const btn = event.currentTarget;
      clearFormError(emailForm);
      clearFormSuccess(emailForm);
      btn.disabled = true;
      try {
        const { response, data } = await post("/api/account/two-factor/email-setup");
        if (!response.ok) throw new Error((data && data.error) || "Could not resend code.");
        showFormSuccess(emailForm, data.message || "Code sent.");
      } catch (error) {
        showFormError(emailForm, error.message || "Could not resend code.");
      } finally {
        btn.disabled = false;
      }
    });

    byId("settings-2fa-setup-cancel").addEventListener("click", function () { emailForm.hidden = true; });

    emailForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(emailForm);
      clearFormSuccess(emailForm);

      const code = emailForm.querySelector('[name="code"]').value.trim();
      const submit = emailForm.querySelector('[type="submit"]');
      submit.disabled = true;

      try {
        const { response, data } = await post("/api/account/two-factor/email-enable", { code });
        if (!response.ok) throw new Error((data && data.error) || "Could not enable email codes.");

        profile.emailMasked = data.emailMasked || profile.emailMasked;
        if (data.backupCodes) profile.backupCodesRemaining = data.backupCodes.length;
        addMethod("email");
        render();
        showBackupCodes(data.backupCodes);
      } catch (error) {
        showFormError(emailForm, error.message || "Could not enable email codes.");
      } finally {
        submit.disabled = false;
      }
    });

    // ---- authenticator: set up ---------------------------------------------

    function showTotpSetup(data) {
      totpSecret = String(data.secret || "");
      if (!renderQrCode(totpQrEl, data.otpauthUri)) totpQrEl.textContent = "";
      totpSecretEl.textContent = totpSecret.replace(/(.{4})(?=.)/g, "$1 ");
      clearFormError(totpForm);
      clearFormSuccess(totpForm);
      totpForm.hidden = false;
      if (totpCodeGroup) totpCodeGroup.clear();
    }

    totpStartBtn.addEventListener("click", async function () {
      totpStartBtn.disabled = true;
      closeForms();
      try {
        const { response, data } = await post("/api/account/two-factor/totp-setup");
        if (!response.ok) {
          totpForm.hidden = false;
          showFormError(totpForm, (data && data.error) || "Could not start authenticator setup.");
          return;
        }
        showTotpSetup(data);
      } finally {
        totpStartBtn.disabled = false;
      }
    });

    byId("settings-2fa-totp-cancel").addEventListener("click", clearTotpSetup);

    function flashCopied() {
      if (totpCopyBtn) totpCopyBtn.classList.add("is-copied");
      if (totpCopyStatusEl) totpCopyStatusEl.hidden = false;
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(function () {
        if (totpCopyBtn) totpCopyBtn.classList.remove("is-copied");
        if (totpCopyStatusEl) totpCopyStatusEl.hidden = true;
      }, 2000);
    }

    if (totpCopyBtn) {
      totpCopyBtn.addEventListener("click", async function () {
        if (!totpSecret) return;
        try {
          await navigator.clipboard.writeText(totpSecret);
          flashCopied();
          return;
        } catch (error) {
          // fall through to the selection-based copy below
        }
        try {
          const range = document.createRange();
          range.selectNodeContents(totpSecretEl);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          if (document.execCommand("copy")) flashCopied();
        } catch (error) {
          // The key stays selected, so it can still be copied by hand.
        }
      });
    }

    totpForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormError(totpForm);
      clearFormSuccess(totpForm);

      const code = totpForm.querySelector('[name="code"]').value.trim();
      const submit = totpForm.querySelector('[type="submit"]');
      submit.disabled = true;

      try {
        const { response, data } = await post("/api/account/two-factor/totp-enable", { code });
        if (!response.ok) throw new Error((data && data.error) || "Could not enable the authenticator app.");

        if (data.backupCodes) profile.backupCodesRemaining = data.backupCodes.length;
        addMethod("totp");
        render();
        showBackupCodes(data.backupCodes);
      } catch (error) {
        showFormError(totpForm, error.message || "Could not enable the authenticator app.");
        if (totpCodeGroup) totpCodeGroup.clear();
      } finally {
        submit.disabled = false;
      }
    });

    // ---- backup codes ------------------------------------------------------

    if (backupDismissBtn) {
      backupDismissBtn.addEventListener("click", function () {
        backupBox.hidden = true;
        backupList.textContent = "";
      });
    }

    if (regenerateStartBtn && regenerateForm) {
      regenerateStartBtn.addEventListener("click", function () {
        clearFormError(regenerateForm);
        clearFormSuccess(regenerateForm);
        regenerateForm.hidden = !regenerateForm.hidden;
      });

      regenerateForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearFormError(regenerateForm);
        clearFormSuccess(regenerateForm);

        const passwordField = regenerateForm.querySelector('[name="currentPassword"]');
        const submit = regenerateForm.querySelector('[type="submit"]');
        setButtonLoading(submit, true);

        try {
          const { response, data } = await post("/api/account/two-factor/regenerate-backup-codes", {
            currentPassword: passwordField.value,
          });
          if (!response.ok) throw new Error((data && data.error) || "Could not regenerate backup codes.");

          profile.backupCodesRemaining = (data.backupCodes && data.backupCodes.length) || 0;
          regenerateForm.hidden = true;
          render();
          showBackupCodes(data.backupCodes);
        } catch (error) {
          showFormError(regenerateForm, error.message || "Could not regenerate backup codes.");
        } finally {
          passwordField.value = "";
          setButtonLoading(submit, false);
        }
      });
    }

    // ---- removing a method -------------------------------------------------

    // Removing signs every device out (the server revokes all sessions), so a
    // successful removal ends on the login page.
    function wireRemoval({ startBtn, form, resendBtn, cancelBtn, backupInput, method, sendsCode }) {
      async function sendCode(isResend) {
        clearFormError(form);
        clearFormSuccess(form);
        const { response, data } = await post("/api/account/two-factor/send-code", {
          purpose: "disable",
          method: method(),
        });
        form.hidden = false;
        if (!response.ok) {
          showFormError(form, (data && data.error) || (isResend ? "Could not resend code." : "Could not send code."));
        } else {
          showFormSuccess(form, data.message || "Code sent.");
        }
      }

      startBtn.addEventListener("click", async function () {
        const open = !form.hidden;
        closeForms();
        if (open) return;
        startBtn.disabled = true;
        try {
          if (sendsCode()) {
            await sendCode(false);
          } else {
            clearFormError(form);
            form.hidden = false;
            showFormSuccess(form, "Enter the current code from your authenticator app, or a backup code.");
          }
        } finally {
          startBtn.disabled = false;
        }
      });

      if (resendBtn) {
        resendBtn.addEventListener("click", async function () {
          resendBtn.disabled = true;
          try {
            await sendCode(true);
          } finally {
            resendBtn.disabled = false;
          }
        });
      }

      cancelBtn.addEventListener("click", function () { form.hidden = true; });

      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearFormError(form);
        clearFormSuccess(form);

        const code = form.querySelector('[name="code"]').value.trim() || (backupInput ? backupInput.value.trim() : "");
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;

        try {
          const { response, data } = await post("/api/account/two-factor/disable", { method: method(), code });
          if (!response.ok) throw new Error((data && data.error) || "Could not remove this method.");

          showFormSuccess(form, (data.message || "Removed.") + " Redirecting to log in...");
          window.setTimeout(function () {
            window.location.href = "/login/";
          }, 1800);
        } catch (error) {
          showFormError(form, error.message || "Could not remove this method.");
          submit.disabled = false;
        }
      });
    }

    wireRemoval({
      startBtn: emailRemoveBtn,
      form: emailRemoveForm,
      resendBtn: byId("settings-2fa-disable-resend"),
      cancelBtn: byId("settings-2fa-disable-cancel"),
      backupInput: byId("settings-2fa-disable-backup"),
      method: function () { return methods().indexOf("sms") !== -1 ? "sms" : "email"; },
      sendsCode: function () { return true; },
    });

    wireRemoval({
      startBtn: totpRemoveBtn,
      form: totpRemoveForm,
      resendBtn: null,
      cancelBtn: byId("settings-2fa-totp-remove-cancel"),
      backupInput: byId("settings-2fa-totp-remove-backup"),
      method: function () { return "totp"; },
      sendsCode: function () { return false; },
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
    initMotionPicker();

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
    initSecurityPhraseSettings();
    initDeveloperSettings(profile);

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

        core.setSessionCache({ authenticated: false });
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

    initSettingsStepModal(profileForm, {
      triggerLabel: "Edit Profile",
      steps: ["accountId", "displayName"],
    });
    initSettingsStepModal(passwordForm, {
      triggerLabel: "Update Password",
      steps: ["current", "new"],
    });
    initSettingsStepModal(document.getElementById("settings-security-phrase-form"), {
      triggerLabel: "Set Security Phrase",
      steps: ["phrase", "password"],
    });
    initSettingsStepModal(deleteForm, {
      triggerLabel: "Delete Account",
      steps: ["password", "confirm"],
      danger: true,
    });
  }

  // Collapses a multi-field settings form down to a single trigger button,
  // moving the form itself (steps, submit handler, and all) into a modal
  // shell that reuses the exact same .auth-modal-* classes as the login/
  // register overlay -- so "a separate window similar to log in" is
  // literally true, not just visually similar. The form's existing submit
  // handler, field lookups (all by [name]), and showFormError/showFormSuccess
  // calls are untouched: moving a node via appendChild preserves its
  // listeners, and hidden .auth-modal-step siblings don't stop a value from
  // being read at submit time.
  function initSettingsStepModal(form, options) {
    if (!form) return;
    options = options || {};
    const stepOrder = options.steps || [];
    const danger = Boolean(options.danger);

    let steps = null;
    if (stepOrder.length > 1) {
      steps = setupSteps(form, stepOrder);

      stepOrder.slice(0, -1).forEach(function (stepName) {
        bindEnterAdvance(
          form.querySelector('[data-step="' + stepName + '"]'),
          form.querySelector('[data-step="' + stepName + '"] [data-action="next"]')
        );
      });

      form.querySelectorAll('[data-action="next"]').forEach(function (btn) {
        btn.addEventListener("click", function () {
          const panel = form.querySelector('[data-step="' + steps.current() + '"]');
          const input = panel
            ? panel.querySelector("input:not([type=hidden]), select, textarea")
            : null;
          if (input && !input.checkValidity()) {
            input.reportValidity();
            return;
          }
          steps.next();
        });
      });

      form.querySelectorAll('[data-action="back"]').forEach(function (btn) {
        btn.addEventListener("click", function () {
          steps.back();
        });
      });
    }

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = danger ? "button settings-delete-button" : "button secondary";
    trigger.textContent = options.triggerLabel || "Edit";

    const triggerRow = document.createElement("div");
    triggerRow.className = "settings-step-trigger-row";
    triggerRow.appendChild(trigger);
    form.parentNode.insertBefore(triggerRow, form);

    const overlay = document.createElement("div");
    overlay.className = "auth-modal-overlay settings-step-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const backdrop = document.createElement("div");
    backdrop.className = "auth-modal-backdrop";

    const shell = document.createElement("div");
    shell.className = "auth-modal-shell";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "auth-modal-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";

    const card = document.createElement("div");
    card.className = "auth-card auth-card--modern auth-card-elevated auth-modal-card";
    const accent = document.createElement("div");
    accent.className = "auth-card-accent";
    accent.setAttribute("aria-hidden", "true");
    const body = document.createElement("div");
    body.className = "auth-card-body";

    card.appendChild(accent);
    card.appendChild(body);
    shell.appendChild(closeBtn);
    shell.appendChild(card);
    overlay.appendChild(backdrop);
    overlay.appendChild(shell);
    document.body.appendChild(overlay);

    body.appendChild(form);
    form.hidden = false;

    let keydownHandler = null;

    function open() {
      clearFormError(form);
      clearFormSuccess(form);
      if (steps) steps.show(stepOrder[0]);
      overlay.classList.add("is-open");
      document.body.classList.add("auth-modal-open");
      keydownHandler = function (event) {
        if (event.key === "Escape") close();
      };
      document.addEventListener("keydown", keydownHandler);
      window.requestAnimationFrame(function () {
        const target = form.querySelector(
          ".auth-modal-step:not([hidden]) input, .auth-modal-step:not([hidden]) .otp-box"
        ) || form.querySelector("input");
        if (target) target.focus();
      });
    }

    function close() {
      overlay.classList.remove("is-open");
      document.body.classList.remove("auth-modal-open");
      if (keydownHandler) {
        document.removeEventListener("keydown", keydownHandler);
        keydownHandler = null;
      }
    }

    trigger.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    backdrop.addEventListener("click", close);

    return { open: open, close: close };
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


  window.KanasakaAuthSettings = { init: initSettingsPage };
})();
