// Site shell: the navigation and footer data, and pure functions that turn it
// into HTML. One source for two consumers:
//
//   * scripts/prerender.mjs writes the result into every page, so the header and
//     footer are in the HTML itself (first paint, no-JS visitors, page
//     transitions without a headerless flash);
//   * assets/js/main.js hydrates that markup, and falls back to rendering it from
//     here when a page was not pre-rendered.
//
// Also exposed as window.KanasakaNav for the terminal (console.js).
//
// Only pages that exist. A page joins the nav when it has real content (see
// docs/DESIGN.md > Information architecture); unfinished pages keep their URL
// but stay out of the nav and the footer. A section with `children` is a
// dropdown; its `href` is the section's overview page (clicking the label goes
// there on desktop; on phones the label expands the list instead).
(function (root) {
  var NAV = [
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
        { label: "Changelog", href: "/changelog/" },
      ],
    },
    {
      label: "Support",
      href: "/support/",
      children: [
        { label: "FAQ", href: "/support/faq/" },
        { label: "System status", href: "/support/system-status/" },
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
  var FOOTER_COLUMNS = [
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
        { label: "Changelog", href: "/changelog/" },
      ],
    },
    {
      title: "Support",
      links: [
        { label: "FAQ", href: "/support/faq/" },
        { label: "System status", href: "/support/system-status/" },
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

  var LOGO_PATH =
    "M0,0 L101.6,0 L101.6,514.4 L615.98,0 L761.75,0 L380.73,380.7 L460.22,460.1 L920.35,0 L1523.6,0 L1523.6,101.8 L964.6,101.8 L863.1,203.08 L863.1,334.88 L1523.6,334.88 L1523.6,606.05 L1371.35,761.85 L615.98,761.85 L460.22,606.05 L307.35,761.85 L0,761.85 Z M761.75,304.45 L761.75,436.43 L1421.9,436.43 L1421.9,565.2 L1326.98,660.12 L659.85,660.12 L533.25,533 Z M307.35,453.7 L387.48,533 L260.35,660.12 L101.6,660.12 Z";

  function esc(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizePath(path) {
    if (!path || path === "/") return "/";
    return path.charAt(path.length - 1) === "/" ? path : path + "/";
  }

  function renderNav(path) {
    var current = path === null || path === undefined ? null : normalizePath(path);
    function isActive(href) {
      return current !== null && normalizePath(href) === current;
    }

    var out = [];
    out.push(
      '<div class="nav-item"><a class="nav-link' + (current === "/" ? " active" : "") + '" href="/">Home</a></div>'
    );

    NAV.forEach(function (section) {
      if (!section.children) {
        out.push(
          '<div class="nav-item"><a class="nav-link' +
            (isActive(section.href) ? " active" : "") +
            '" href="' + esc(section.href) + '">' + esc(section.label) + "</a></div>"
        );
        return;
      }

      var inSection =
        isActive(section.href) ||
        section.children.some(function (child) {
          return isActive(child.href);
        });

      var dropdown = [];
      dropdown.push(
        // phones: the label only expands the list, so the overview gets its own row
        '<a class="nav-dropdown-overview' + (isActive(section.href) ? " active" : "") + '" href="' +
          esc(section.href) + '">' + esc(section.label) + " overview</a>"
      );
      section.children.forEach(function (child) {
        dropdown.push(
          "<a" + (isActive(child.href) ? ' class="active"' : "") + ' href="' + esc(child.href) + '">' +
            esc(child.label) + "</a>"
        );
      });

      out.push(
        '<div class="nav-item"><a class="nav-link' + (inSection ? " active" : "") + '" href="' + esc(section.href) +
          '" aria-haspopup="true" aria-expanded="false">' + esc(section.label) + "</a>" +
          '<div class="nav-dropdown">' + dropdown.join("") + "</div></div>"
      );
    });

    return '<nav class="site-nav" aria-label="Main navigation">' + out.join("") + "</nav>";
  }

  // The sign-in controls are the one part that depends on who is looking, so
  // the markup is the signed-out state and main.js swaps `.header-auth` once
  // the session is known (the header carries `is-auth-pending` until then).
  function renderHeader(options) {
    var opts = options || {};
    var pending = opts.authPending !== false;
    return (
      '<header id="site-header" class="site-header' + (pending ? " is-auth-pending" : "") + '">' +
      '<div class="site-header-inner">' +
      '<a class="site-logo" href="/">' +
      '<svg class="site-logo-ks" viewBox="0 0 1523.6 761.85" aria-hidden="true" focusable="false">' +
      '<path fill-rule="evenodd" d="' + LOGO_PATH + '"/></svg>' +
      '<span class="site-logo-text">KANASAKA</span></a>' +
      renderNav(opts.path) +
      '<div class="header-actions">' +
      '<button type="button" class="terminal-link" aria-label="Search the site (opens the KS_Site terminal)" title="Search (Ctrl+K)">' +
      '<span class="terminal-link-mark" aria-hidden="true">//</span><span class="terminal-link-label">Search</span></button>' +
      '<div class="header-auth">' +
      '<a class="auth-link" href="/login/">Log In</a>' +
      '<a class="auth-link secondary" href="/register/">Register</a></div>' +
      '<button type="button" class="nav-toggle" aria-label="Open navigation menu" aria-expanded="false">' +
      '<span class="nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span></button>' +
      "</div></div></header>"
    );
  }

  function renderFooter() {
    var columns = FOOTER_COLUMNS.map(function (column) {
      return (
        '<nav class="footer-col" aria-label="' + esc(column.title) + '"><h2>' + esc(column.title) + "</h2><ul>" +
        column.links
          .map(function (link) {
            return '<li><a href="' + esc(link.href) + '">' + esc(link.label) + "</a></li>";
          })
          .join("") +
        "</ul></nav>"
      );
    });

    return (
      '<footer id="site-footer" class="site-footer"><div class="site-footer-inner">' +
      '<div class="footer-grid"><div class="footer-brand"><span class="footer-wordmark">KANASAKA</span>' +
      "<p>Software and AI.</p></div>" + columns.join("") + "</div>" +
      '<div class="footer-base"><p>© 2026 KANASAKA · Germany</p></div>' +
      "</div></footer>"
    );
  }

  root.KanasakaShell = {
    nav: NAV,
    footer: FOOTER_COLUMNS,
    renderHeader: renderHeader,
    renderFooter: renderFooter,
    normalizePath: normalizePath,
  };
  // shared with the command console (assets/js/console.js)
  root.KanasakaNav = { nav: NAV, footer: FOOTER_COLUMNS };
})(typeof window !== "undefined" ? window : this);
