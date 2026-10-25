(function () {
  const NAV = [
    {
      label: "Downloads",
      children: [
        { label: "All Downloads", href: "/downloads/" },
        { label: "KS_Link", href: "/downloads/#ks-link" },
      ],
    },
    {
      label: "Products",
      children: [
        { label: "KS_Link", href: "/products/ks-link/" },
        { label: "Robotics", href: "/products/robotics/" },
      ],
    },
    {
      label: "Research",
      children: [
        { label: "Artificial Intelligence", href: "/research/artificial-intelligence/" },
        { label: "Robotics", href: "/research/robotics/" },
        { label: "Publications", href: "/research/publications/" },
        { label: "Future Projects", href: "/research/future-projects/" },
      ],
    },
    {
      label: "Company",
      children: [
        { label: "About KANASAKA", href: "/company/about/" },
        { label: "Vision", href: "/company/vision/" },
        { label: "Leadership", href: "/company/leadership/" },
        { label: "News", href: "/company/news/" },
        { label: "Careers", href: "/company/careers/" },
      ],
    },
    {
      label: "Support",
      children: [
        { label: "Documentation", href: "/support/documentation/" },
        { label: "FAQ", href: "/support/faq/" },
        { label: "Contact", href: "/support/contact/" },
        { label: "System Status", href: "/support/system-status/" },
      ],
    },
    {
      label: "Developers",
      children: [
        { label: "API", href: "/developers/api/" },
        { label: "SDK", href: "/developers/sdk/" },
        { label: "GitHub", href: "/developers/github/" },
        { label: "Documentation", href: "/developers/documentation/" },
      ],
    },
    {
      label: "Media",
      children: [
        { label: "Press Kit", href: "/media/press-kit/" },
        { label: "Brand Assets", href: "/media/brand-assets/" },
        { label: "Gallery", href: "/media/gallery/" },
        { label: "Videos", href: "/media/videos/" },
      ],
    },
    {
      label: "Legal",
      children: [
        { label: "Products", href: "/legal/products/" },
        { label: "Privacy", href: "/legal/privacy/" },
        { label: "Terms", href: "/legal/terms/" },
        { label: "Refunds", href: "/legal/refunds/" },
        { label: "Cookies", href: "/legal/cookies/" },
        { label: "Licenses", href: "/legal/licenses/" },
        { label: "Security", href: "/legal/security/" },
        { label: "Impressum", href: "/legal/impressum/" },
      ],
    },
  ];

  const FOOTER_LINKS = [
    { label: "Privacy", href: "/legal/privacy/" },
    { label: "Terms", href: "/legal/terms/" },
    { label: "Refunds", href: "/legal/refunds/" },
    { label: "Cookies", href: "/legal/cookies/" },
    { label: "Impressum", href: "/legal/impressum/" },
    { label: "Contact", href: "/support/contact/" },
  ];

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
      const item = document.createElement("div");
      item.className = "nav-item";

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className =
        "nav-link" + (isInSection(section.children) ? " active" : "");
      trigger.textContent = section.label;
      trigger.setAttribute("aria-haspopup", "true");
      trigger.setAttribute("aria-expanded", "false");

      const dropdown = document.createElement("div");
      dropdown.className = "nav-dropdown";

      section.children.filter(canSeeNavItem).forEach(function (child) {
        const link = document.createElement("a");
        link.href = child.href;
        link.textContent = child.label;
        if (isActive(child.href)) {
          link.classList.add("active");
        }
        dropdown.appendChild(link);
      });

      trigger.addEventListener("click", function () {
        if (window.innerWidth <= 1024) {
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

  function buildHeader() {
    const header = document.createElement("header");
    header.id = "site-header";
    header.className = "site-header";

    const inner = document.createElement("div");
    inner.className = "site-header-inner";

    const logo = document.createElement("a");
    logo.className = "site-logo";
    logo.href = "/";
    logo.innerHTML =
      '<div class="site-logo-mark">' +
      '<div class="logo-side"><div></div><div></div></div>' +
      '<div class="logo-center"><span>K</span>' +
      '<svg class="logo-s" viewBox="0 0 625 1000" aria-hidden="true" focusable="false">' +
      '<path d="M0,0 L625,0 L625,158 L158,158 L158,421 L625,421 L625,1000 L0,1000 L0,842 L467,842 L467,579 L0,579 Z"/>' +
      "</svg></div>" +
      '<div class="logo-side"><div></div><div></div></div>' +
      "</div>" +
      '<span class="site-logo-text">KANASAKA</span>';

    const actions = document.createElement("div");
    actions.className = "header-actions";

    actions.appendChild(buildAuthControls());

    const navToggle = document.createElement("button");
    navToggle.type = "button";
    navToggle.className = "nav-toggle";
    navToggle.textContent = "Menu";
    navToggle.setAttribute("aria-label", "Toggle navigation menu");

    const nav = buildNav();

    navToggle.addEventListener("click", function () {
      const open = nav.classList.toggle("open");
      navToggle.textContent = open ? "Close" : "Menu";
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

    const links = document.createElement("div");
    links.className = "footer-links";

    FOOTER_LINKS.forEach(function (link) {
      const a = document.createElement("a");
      a.href = link.href;
      a.textContent = link.label;
      links.appendChild(a);
    });

    const tagline = document.createElement("p");
    tagline.className = "footer-tagline";
    tagline.textContent = "Software · AI · Robotics · Biotech";

    const copy = document.createElement("p");
    copy.textContent = "\u00a9 2026 KANASAKA";

    inner.appendChild(links);
    inner.appendChild(tagline);
    inner.appendChild(copy);
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
    if (document.querySelector(".kanasaka-rail") || document.querySelector(".hero-ascii")) {
      return;
    }

    document.body.appendChild(buildAmbientRail("right"));
  }

  function mountLayout() {
    const headerSlot = document.getElementById("site-header");
    const footerSlot = document.getElementById("site-footer");

    if (headerSlot) {
      headerSlot.replaceWith(buildHeader());
    }

    if (footerSlot) {
      footerSlot.replaceWith(buildFooter());
    }

    mountAmbientRails();
  }

  window.KanasakaLayout = {
    remount: mountLayout,
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

      loadScript("/assets/js/hero-ascii.js?v=84").then(resolve);
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

  async function boot() {
    initTheme();
    initCookieConsent();

    if (window.KanasakaAuth) {
      await window.KanasakaAuth.initSession();
    }

    mountLayout();

    window.requestAnimationFrame(function () {
      document.body.classList.add("is-site-ready");
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
