(function () {
  // Navigation/footer data and their markup live in assets/js/shell.js and are
  // pre-rendered into every page (scripts/prerender.mjs). This file hydrates
  // that markup; if a page was not pre-rendered it renders the shell itself.
  const currentPath = normalizePath(window.location.pathname);

  function normalizePath(path) {
    if (!path || path === "/") return "/";
    return path.endsWith("/") ? path : path + "/";
  }

  function initTheme() {
    const stored = localStorage.getItem("kanasaka-theme");
    const theme =
      stored === "light" || stored === "dark" || stored === "accent" ? stored : "dark";
    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("kanasaka-theme", theme);
    syncThemePicker(theme);
  }

  function syncThemePicker(theme) {
    document.querySelectorAll("[data-theme-option]").forEach(function (button) {
      const selected = button.getAttribute("data-theme-option") === theme;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function getTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function setTheme(theme) {
    if (theme !== "dark" && theme !== "light" && theme !== "accent") {
      return;
    }
    if (window.KanasakaMotion && getTheme() !== theme) {
      window.KanasakaMotion.transition(function () {
        applyTheme(theme);
      });
      return;
    }
    applyTheme(theme);
  }

  function buildAuthControls() {
    const wrap = document.createElement("div");
    wrap.className = "header-auth";

    const session =
      window.KanasakaAuth && window.KanasakaAuth.getSession
        ? window.KanasakaAuth.getSession()
        : { authenticated: false };

    if (session.authenticated) {
      const profileLink = document.createElement("a");
      profileLink.className = "header-user";
      profileLink.href = "/account/settings/";
      profileLink.title = "Account settings";

      const avatar = document.createElement("span");
      avatar.className = "header-avatar";
      if (session.hasAvatar && session.avatarUrl) {
        const img = document.createElement("img");
        img.src = session.avatarUrl;
        img.alt = "";
        avatar.appendChild(img);
      } else {
        avatar.textContent = session.initials || "KS";
      }

      const name = document.createElement("span");
      name.className = "header-display-name";
      name.textContent = session.displayLabel || session.email;

      profileLink.appendChild(avatar);
      profileLink.appendChild(name);

      wrap.appendChild(profileLink);
      return wrap;
    }

    function openModalOnClick(link, mode) {
      link.addEventListener("click", function (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        if (window.KanasakaAuth && window.KanasakaAuth.openAuthModal) {
          event.preventDefault();
          window.KanasakaAuth.openAuthModal(mode);
        }
      });
    }

    const login = document.createElement("a");
    login.className = "auth-link";
    login.href = "/login/";
    login.textContent = "Log In";
    openModalOnClick(login, "login");

    const register = document.createElement("a");
    register.className = "auth-link secondary";
    register.href = "/register/";
    register.textContent = "Register";
    openModalOnClick(register, "register");

    wrap.appendChild(login);
    wrap.appendChild(register);
    return wrap;
  }

  // Wires up the header that is already in the page (from scripts/prerender.mjs
  // or from renderShell below). Nothing here rebuilds markup.
  function hydrateHeader(header) {
    if (!header || header.getAttribute("data-hydrated") === "1") return;
    header.setAttribute("data-hydrated", "1");

    const nav = header.querySelector(".site-nav");
    const toggle = header.querySelector(".nav-toggle");
    const terminalLink = header.querySelector(".terminal-link");

    if (terminalLink) {
      terminalLink.addEventListener("click", function () {
        if (window.KanasakaConsole) window.KanasakaConsole.open();
      });
    }

    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        const open = nav.classList.toggle("open");
        toggle.classList.toggle("is-open", open);
        toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    // On narrow screens the first tap on a section label expands its list
    // instead of navigating (the overview has its own row in the list).
    header.querySelectorAll(".nav-item").forEach(function (item) {
      const trigger = item.querySelector(":scope > .nav-link[aria-haspopup]");
      if (!trigger) return;
      trigger.addEventListener("click", function (event) {
        if (window.innerWidth <= 1240) {
          event.preventDefault();
          const expanded = item.classList.toggle("expanded");
          trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
        }
      });
    });
  }

  // Fallback for a page that has no pre-rendered shell: render it from shell.js.
  function renderShell(slot, html) {
    if (!slot || !window.KanasakaShell) return null;
    const template = document.createElement("template");
    template.innerHTML = html;
    const node = template.content.firstElementChild;
    slot.replaceWith(node);
    return node;
  }

  const WORDMARK = ["K", "A", "N", "A", "S", "A", "K", "A"];

  function buildAmbientRail(side) {
    const rail = document.createElement("div");
    rail.className = "kanasaka-rail kanasaka-rail--" + side;
    rail.setAttribute("aria-hidden", "true");

    WORDMARK.forEach(function (letter) {
      const span = document.createElement("span");
      span.textContent = letter;
      rail.appendChild(span);
    });

    return rail;
  }

  function mountAmbientRails() {
    if (document.querySelector(".kanasaka-rail") || document.getElementById("hero-ascii")) {
      return;
    }

    document.body.classList.add("has-rail");
    (document.querySelector("main") || document.body).appendChild(buildAmbientRail("right"));
  }

  function mountPageMark() {
    const main = document.querySelector("main");
    if (!main || document.getElementById("hero-ascii") || main.querySelector(".page-mark")) {
      return;
    }

    const mark = document.createElement("div");
    mark.className = "page-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "//";
    document.body.classList.add("has-page-mark");
    // appended, not prepended: sections are styled by :first-child / nth-child
    main.appendChild(mark);
  }

  // The sign-in state is known (or changed): swap only the sign-in controls and
  // reveal them. The rest of the header, including an open menu and the nav
  // indicator, stays as it is. The footer is left alone because hud.js
  // appends its readout line to it once.
  function refreshHeader() {
    const header = document.getElementById("site-header");
    if (!header) return;
    const current = header.querySelector(".header-auth");
    if (current) current.replaceWith(buildAuthControls());
    header.classList.remove("is-auth-pending");
  }

  function mountLayout(authPending) {
    let header = document.getElementById("site-header");
    let footer = document.getElementById("site-footer");

    if (header && !header.classList.contains("site-header") && window.KanasakaShell) {
      header = renderShell(header, window.KanasakaShell.renderHeader({ path: currentPath, authPending: authPending === true }));
    }
    hydrateHeader(header);

    if (footer && !footer.classList.contains("site-footer") && window.KanasakaShell) {
      renderShell(footer, window.KanasakaShell.renderFooter());
    }

    mountAmbientRails();
    mountPageMark();
  }

  window.KanasakaLayout = {
    remount: refreshHeader,
  };

  window.KanasakaTheme = {
    getTheme: getTheme,
    setTheme: setTheme,
    syncThemePicker: syncThemePicker,
  };

  function loadScript(src) {
    return new Promise(function (resolve) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }

  function loadMotion() {
    return new Promise(function (resolve) {
      if (window.KanasakaMotion) {
        resolve();
        return;
      }

      loadScript("/assets/js/motion.js?v=9").then(resolve);
    });
  }

  function loadConsole() {
    if (window.KanasakaConsole || window.__ksConsoleLoading) return;
    window.__ksConsoleLoading = true;
    loadScript("/assets/js/console.js?v=7");
  }

  function loadHud() {
    if (window.__ksHudLoaded) return;
    window.__ksHudLoaded = true;
    loadScript("/assets/js/hud.js?v=5");
  }

  function loadLogoAnimation() {
    return new Promise(function (resolve) {
      if (window.KanasakaLogoAnimation) {
        resolve();
        return;
      }

      loadScript("/assets/js/logo-animation.js?v=69").then(resolve);
    });
  }

  function loadTerms() {
    return new Promise(function (resolve) {
      if (window.KanasakaTerms) {
        resolve();
        return;
      }

      loadScript("/assets/js/tos.js?v=69").then(resolve);
    });
  }

  function loadHeroAscii() {
    return new Promise(function (resolve) {
      if (!document.getElementById("hero-ascii")) {
        resolve();
        return;
      }

      if (window.KanasakaHeroAscii) {
        resolve();
        return;
      }

      loadScript("/assets/js/hero-ascii.js?v=108").then(resolve);
    });
  }

  const COOKIE_ACK_KEY = "kanasaka-cookie-ack";

  function initCookieConsent() {
    if (localStorage.getItem(COOKIE_ACK_KEY) === "1") return;

    const banner = document.createElement("div");
    banner.className = "cookie-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookie notice");

    const text = document.createElement("p");
    text.className = "cookie-consent-text";
    text.innerHTML =
      'We use a strictly necessary session cookie to keep you signed in — no tracking or advertising cookies. ' +
      '<a href="/legal/cookies/">Cookie Policy</a>';

    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "cookie-consent-ok";
    ok.textContent = "OK";
    ok.addEventListener("click", function () {
      localStorage.setItem(COOKIE_ACK_KEY, "1");
      banner.remove();
    });

    banner.appendChild(text);
    banner.appendChild(ok);
    document.body.appendChild(banner);
  }

  function loadBoot() {
    if (window.__ksBootLoading) return;
    window.__ksBootLoading = true;
    loadScript("/assets/js/boot.js?v=3");
  }

  async function boot() {
    initTheme();
    initCookieConsent();

    // Scripts that do not depend on the session start loading straight away.
    const motionReady = loadMotion();
    loadBoot();

    // The shell data normally arrives with its own <script> tag; this is the
    // fallback for a page that lacks it.
    if (!window.KanasakaShell) await loadScript("/assets/js/shell.js?v=2");

    // Header and footer first: the session check is a network call, and the
    // page used to sit without its header until it came back. The sign-in
    // controls stay hidden until the session is known, then the header is
    // rebuilt once with the real state.
    mountLayout(true);
    loadHud();
    loadConsole();

    if (window.KanasakaAuth) {
      await window.KanasakaAuth.initSession();
    }

    refreshHeader();
    await motionReady;

    window.requestAnimationFrame(function () {
      document.body.classList.add("is-site-ready");
      if (window.KanasakaMotion) window.KanasakaMotion.mount();
    });

    if (window.KanasakaAuth) {
      window.KanasakaAuth.initAuthForms();
      window.KanasakaAuth.initProtectedPages();
      window.KanasakaAuth.initSettingsPage();
      if (window.KanasakaAuth.applyAccountGatedVisibility) {
        window.KanasakaAuth.applyAccountGatedVisibility(document);
      }
      if (window.KanasakaAuth.initLegalNotices) {
        window.KanasakaAuth.initLegalNotices();
      }
    }

    await loadLogoAnimation();
    if (window.KanasakaLogoAnimation) {
      window.KanasakaLogoAnimation.init();
    }

    await loadHeroAscii();
    if (window.KanasakaHeroAscii) {
      window.KanasakaHeroAscii.init();
    }

    await loadTerms();
    if (window.KanasakaTerms) {
      window.KanasakaTerms.init();
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
