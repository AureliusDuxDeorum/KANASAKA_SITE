(function () {
  // Only pages that exist. A page joins the nav when it has real content (see
  // docs/DESIGN.md > Information architecture); unfinished pages keep their
  // URL but stay out of the nav and the footer. A section with `children` is a
  // dropdown; its `href` is the section's overview page (clicking the label
  // goes there on desktop; on phones the label expands the list instead). A
  // section with only `href` is a plain link.
  const NAV = [
    {
      label: "Products",
      href: "/products/",
      children: [
        { label: "KS_Link", href: "/products/ks-link/" },
        { label: "Technical overview", href: "/legal/products/" },
      ],
    },
    { label: "Downloads", href: "/downloads/" },
    { label: "Security", href: "/legal/security/" },
    {
      label: "Company",
      href: "/company/",
      children: [
        { label: "About", href: "/company/about/" },
        { label: "Contact", href: "/support/contact/" },
      ],
    },
    {
      label: "Legal",
      href: "/legal/",
      children: [
        { label: "Privacy", href: "/legal/privacy/" },
        { label: "Terms", href: "/legal/terms/" },
        { label: "Refunds", href: "/legal/refunds/" },
        { label: "Cookies", href: "/legal/cookies/" },
        { label: "Impressum", href: "/legal/impressum/" },
      ],
    },
  ];

  // Footer columns (same real pages as the nav, plus the always-useful ones).
  const FOOTER_COLUMNS = [
    {
      title: "Products",
      links: [
        { label: "KS_Link", href: "/products/ks-link/" },
        { label: "Downloads", href: "/downloads/" },
        { label: "Technical overview", href: "/legal/products/" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "/company/about/" },
        { label: "Security", href: "/legal/security/" },
        { label: "Contact", href: "/support/contact/" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy", href: "/legal/privacy/" },
        { label: "Terms", href: "/legal/terms/" },
        { label: "Refunds", href: "/legal/refunds/" },
        { label: "Cookies", href: "/legal/cookies/" },
        { label: "Impressum", href: "/legal/impressum/" },
      ],
    },
  ];

  // shared with the command console (assets/js/console.js)
  window.KanasakaNav = { nav: NAV, footer: FOOTER_COLUMNS };

  const currentPath = normalizePath(window.location.pathname);

  function normalizePath(path) {
    if (!path || path === "/") return "/";
    return path.endsWith("/") ? path : path + "/";
  }

  function isActive(href) {
    return normalizePath(href) === currentPath;
  }

  function isInSection(children) {
    return children.some(function (child) {
      return isActive(child.href);
    });
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

  function canSeeNavItem(child) {
    if (!child.visibleAccountId) {
      return true;
    }

    return (
      window.KanasakaAuth &&
      window.KanasakaAuth.canSeeAccountGated &&
      window.KanasakaAuth.canSeeAccountGated(child.visibleAccountId)
    );
  }

  function buildNav() {
    const nav = document.createElement("nav");
    nav.className = "site-nav";
    nav.setAttribute("aria-label", "Main navigation");

    const homeLink = document.createElement("a");
    homeLink.className = "nav-link" + (currentPath === "/" ? " active" : "");
    homeLink.href = "/";
    homeLink.textContent = "Home";
    nav.appendChild(wrapNavItem(homeLink));

    NAV.forEach(function (section) {
      if (section.href && !section.children) {
        const direct = document.createElement("a");
        direct.className = "nav-link" + (isActive(section.href) ? " active" : "");
        direct.href = section.href;
        direct.textContent = section.label;
        nav.appendChild(wrapNavItem(direct));
        return;
      }

      const item = document.createElement("div");
      item.className = "nav-item";

      // The label is a real link to the section's overview page. Hover/focus
      // opens the dropdown on desktop; on narrow screens the first tap expands
      // the list instead of navigating.
      const trigger = document.createElement(section.href ? "a" : "button");
      if (section.href) {
        trigger.href = section.href;
      } else {
        trigger.type = "button";
      }
      trigger.className =
        "nav-link" +
        (isInSection(section.children) || (section.href && isActive(section.href)) ? " active" : "");
      trigger.textContent = section.label;
      trigger.setAttribute("aria-haspopup", "true");
      trigger.setAttribute("aria-expanded", "false");

      const dropdown = document.createElement("div");
      dropdown.className = "nav-dropdown";

      if (section.href) {
        // phones: the label only expands the list, so the overview gets its own row
        const overview = document.createElement("a");
        overview.className = "nav-dropdown-overview";
        overview.href = section.href;
        overview.textContent = section.label + " overview";
        if (isActive(section.href)) overview.classList.add("active");
        dropdown.appendChild(overview);
      }

      section.children.filter(canSeeNavItem).forEach(function (child) {
        const link = document.createElement("a");
        link.href = child.href;
        link.textContent = child.label;
        if (isActive(child.href)) {
          link.classList.add("active");
        }
        dropdown.appendChild(link);
      });

      trigger.addEventListener("click", function (event) {
        if (window.innerWidth <= 1100) {
          event.preventDefault();
          const expanded = item.classList.toggle("expanded");
          trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
        }
      });

      item.appendChild(trigger);
      item.appendChild(dropdown);
      nav.appendChild(item);
    });

    return nav;
  }

  function wrapNavItem(element) {
    const item = document.createElement("div");
    item.className = "nav-item";
    item.appendChild(element);
    return item;
  }

  function buildHeader(authPending) {
    const header = document.createElement("header");
    header.id = "site-header";
    header.className = "site-header" + (authPending ? " is-auth-pending" : "");

    const inner = document.createElement("div");
    inner.className = "site-header-inner";

    const logo = document.createElement("a");
    logo.className = "site-logo";
    logo.href = "/";
    logo.innerHTML =
      '<svg class="site-logo-ks" viewBox="0 0 1523.6 761.85" aria-hidden="true" focusable="false">' +
      '<path fill-rule="evenodd" d="M0,0 L101.6,0 L101.6,514.4 L615.98,0 L761.75,0 L380.73,380.7 L460.22,460.1 L920.35,0 L1523.6,0 L1523.6,101.8 L964.6,101.8 L863.1,203.08 L863.1,334.88 L1523.6,334.88 L1523.6,606.05 L1371.35,761.85 L615.98,761.85 L460.22,606.05 L307.35,761.85 L0,761.85 Z M761.75,304.45 L761.75,436.43 L1421.9,436.43 L1421.9,565.2 L1326.98,660.12 L659.85,660.12 L533.25,533 Z M307.35,453.7 L387.48,533 L260.35,660.12 L101.6,660.12 Z"/></svg>' +
      '<span class="site-logo-text">KANASAKA</span>';

    const actions = document.createElement("div");
    actions.className = "header-actions";

    // the "//" opens the KS_Site terminal (assets/js/console.js)
    const terminalLink = document.createElement("button");
    terminalLink.type = "button";
    terminalLink.className = "terminal-link";
    terminalLink.textContent = "//";
    terminalLink.setAttribute("aria-label", "Open KS_Site terminal");
    terminalLink.title = "KS_Site terminal (Ctrl+K)";
    terminalLink.addEventListener("click", function () {
      if (window.KanasakaConsole) window.KanasakaConsole.open();
    });
    actions.appendChild(terminalLink);

    actions.appendChild(buildAuthControls());

    const navToggle = document.createElement("button");
    navToggle.type = "button";
    navToggle.className = "nav-toggle";
    // three stacked bars, like the character 三 (see .nav-toggle-bars in style.css)
    navToggle.innerHTML =
      '<span class="nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
    navToggle.setAttribute("aria-label", "Open navigation menu");
    navToggle.setAttribute("aria-expanded", "false");

    const nav = buildNav();

    navToggle.addEventListener("click", function () {
      const open = nav.classList.toggle("open");
      navToggle.classList.toggle("is-open", open);
      navToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    actions.appendChild(navToggle);

    inner.appendChild(logo);
    inner.appendChild(nav);
    inner.appendChild(actions);
    header.appendChild(inner);

    return header;
  }

  function buildFooter() {
    const footer = document.createElement("footer");
    footer.id = "site-footer";
    footer.className = "site-footer";

    const inner = document.createElement("div");
    inner.className = "site-footer-inner";

    const grid = document.createElement("div");
    grid.className = "footer-grid";

    const brand = document.createElement("div");
    brand.className = "footer-brand";
    const wordmark = document.createElement("span");
    wordmark.className = "footer-wordmark";
    wordmark.textContent = "KANASAKA";
    const blurb = document.createElement("p");
    blurb.textContent = "Software and AI.";
    brand.appendChild(wordmark);
    brand.appendChild(blurb);
    grid.appendChild(brand);

    FOOTER_COLUMNS.forEach(function (column) {
      const col = document.createElement("nav");
      col.className = "footer-col";
      col.setAttribute("aria-label", column.title);

      const heading = document.createElement("h2");
      heading.textContent = column.title;
      col.appendChild(heading);

      const list = document.createElement("ul");
      column.links.forEach(function (link) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = link.href;
        a.textContent = link.label;
        li.appendChild(a);
        list.appendChild(li);
      });
      col.appendChild(list);
      grid.appendChild(col);
    });

    const base = document.createElement("div");
    base.className = "footer-base";
    const copy = document.createElement("p");
    copy.textContent = "\u00a9 2026 KANASAKA \u00b7 Germany";
    base.appendChild(copy);

    inner.appendChild(grid);
    inner.appendChild(base);
    footer.appendChild(inner);

    return footer;
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

  // Rebuilds only the header (sign-in state changed). The footer is left alone
  // because hud.js appends its readout line to it once.
  function refreshHeader() {
    const headerSlot = document.getElementById("site-header");
    if (headerSlot) {
      headerSlot.replaceWith(buildHeader(false));
    }
    if (window.KanasakaMotion) window.KanasakaMotion.remountNav();
  }

  function mountLayout(authPending) {
    const headerSlot = document.getElementById("site-header");
    const footerSlot = document.getElementById("site-footer");

    if (headerSlot) {
      headerSlot.replaceWith(buildHeader(authPending === true));
    }

    if (footerSlot) {
      footerSlot.replaceWith(buildFooter());
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

      loadScript("/assets/js/motion.js?v=7").then(resolve);
    });
  }

  function loadConsole() {
    if (window.KanasakaConsole || window.__ksConsoleLoading) return;
    window.__ksConsoleLoading = true;
    loadScript("/assets/js/console.js?v=6");
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

      loadScript("/assets/js/hero-ascii.js?v=99").then(resolve);
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
    loadScript("/assets/js/boot.js?v=2");
  }

  async function boot() {
    initTheme();
    initCookieConsent();

    // Scripts that do not depend on the session start loading straight away.
    const motionReady = loadMotion();
    loadBoot();

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
