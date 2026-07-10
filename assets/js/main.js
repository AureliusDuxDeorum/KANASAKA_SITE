(function () {
  const NAV = [
    {
      label: "Products",
      children: [
        { label: "KS Unify", href: "/products/ks-unify/" },
        { label: "Robotics", href: "/products/robotics/" },
        { label: "Downloads", href: "/downloads/" },
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
        { label: "Downloads", href: "/downloads/" },
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
        { label: "Privacy", href: "/legal/privacy/" },
        { label: "Terms", href: "/legal/terms/" },
        { label: "Licenses", href: "/legal/licenses/" },
        { label: "Security", href: "/legal/security/" },
        { label: "Impressum", href: "/legal/impressum/" },
      ],
    },
  ];

  const FOOTER_LINKS = [
    { label: "Privacy", href: "/legal/privacy/" },
    { label: "Terms", href: "/legal/terms/" },
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
    const theme = stored === "light" || stored === "dark" ? stored : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeLabel(theme);
  }

  function updateThemeLabel(theme) {
    const btn = document.querySelector(".theme-toggle");
    if (btn) {
      btn.textContent = theme === "dark" ? "Light" : "Dark";
      btn.setAttribute("aria-label", "Switch to " + (theme === "dark" ? "light" : "dark") + " mode");
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("kanasaka-theme", next);
    updateThemeLabel(next);
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

      section.children.forEach(function (child) {
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
    header.className = "site-header";

    const inner = document.createElement("div");
    inner.className = "site-header-inner";

    const logo = document.createElement("a");
    logo.className = "site-logo";
    logo.href = "/";
    logo.innerHTML =
      '<div class="site-logo-mark">' +
      '<div class="logo-side"><div></div><div></div></div>' +
      '<div class="logo-center"><span>K</span><span>S</span></div>' +
      '<div class="logo-side"><div></div><div></div></div>' +
      "</div>" +
      '<span class="site-logo-text">KANASAKA</span>';

    const actions = document.createElement("div");
    actions.className = "header-actions";

    const themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "theme-toggle";
    themeBtn.addEventListener("click", toggleTheme);

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

    actions.appendChild(themeBtn);
    actions.appendChild(navToggle);

    inner.appendChild(logo);
    inner.appendChild(nav);
    inner.appendChild(actions);
    header.appendChild(inner);

    return header;
  }

  function buildFooter() {
    const footer = document.createElement("footer");
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

    const copy = document.createElement("p");
    copy.textContent = "\u00a9 2026 KANASAKA";

    inner.appendChild(links);
    inner.appendChild(copy);
    footer.appendChild(inner);

    return footer;
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
  }

  initTheme();
  document.addEventListener("DOMContentLoaded", mountLayout);
})();
