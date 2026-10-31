(function () {
  "use strict";

  // Quiet "console" labels. Everything shown is read from the page or the build:
  //
  //   footer line   //SYS  build version / time / revision (assets/site-meta.json),
  //                 the active theme and its four real hex codes (live from CSS)
  //   left edge     //xf_<route>_<theme>_<layout>  + route + scroll position
  //
  // Code grammar:  xf_SSP_T_LL
  //   SS  nav section, in header order (00 Home, 01 Downloads, 02 Products ...)
  //   P   page within the section (1-based, as in its dropdown)
  //   T   theme: d dark, l light, a accent
  //   LL  layout class by viewport width: 01 phone (<768), 02 tablet (<1024),
  //       03 laptop (<1700), 04 desktop
  // Pages outside the nav use fixed codes (see OUTSIDE_NAV).

  var OUTSIDE_NAV = [
    ["/account/", "090"],
    ["/admin/", "091"],
    ["/login/", "092"],
    ["/register/", "093"],
    ["/verify/", "094"],
    ["/forgot-password/", "095"],
    ["/reset-password/", "096"],
  ];

  var THEME_LETTER = { dark: "d", light: "l", accent: "a" };
  var SWATCHES = [
    ["BASE", "--color-base"],
    ["SURF", "--color-surface"],
    ["LINE", "--color-border"],
    ["INK", "--color-text"],
  ];

  var meta = null;
  var verticalEl = null;
  var footerEl = null;
  var scrollQueued = false;

  function pad(value, size) {
    var s = String(value);
    while (s.length < size) s = "0" + s;
    return s;
  }

  function theme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function layoutClass() {
    var w = window.innerWidth;
    return w < 768 ? "01" : w < 1024 ? "02" : w < 1700 ? "03" : "04";
  }

  function routeCode() {
    var path = window.location.pathname;
    if (path === "/") return "000";

    var items = document.querySelectorAll(".site-nav > .nav-item");
    for (var i = 0; i < items.length; i++) {
      var links = items[i].querySelectorAll(".nav-dropdown a");
      for (var j = 0; j < links.length; j++) {
        if (links[j].classList.contains("active")) {
          return pad(i, 2) + String(j + 1);
        }
      }
    }

    for (var k = 0; k < OUTSIDE_NAV.length; k++) {
      if (path.indexOf(OUTSIDE_NAV[k][0]) === 0) return OUTSIDE_NAV[k][1];
    }
    return "099";
  }

  function toHex(value) {
    var v = String(value || "").trim();
    if (v.charAt(0) === "#") {
      if (v.length === 4) {
        v = "#" + v.charAt(1) + v.charAt(1) + v.charAt(2) + v.charAt(2) + v.charAt(3) + v.charAt(3);
      }
      return v.toUpperCase();
    }
    var m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (!m) return v.toUpperCase();
    return (
      "#" +
      [m[1], m[2], m[3]]
        .map(function (n) {
          return pad(Number(n).toString(16), 2);
        })
        .join("")
        .toUpperCase()
    );
  }

  function span(className, text) {
    var el = document.createElement("span");
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function scrollPercent() {
    var root = document.documentElement;
    var range = root.scrollHeight - window.innerHeight;
    if (range <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((window.scrollY / range) * 100)));
  }

  function renderVertical() {
    if (!verticalEl) return;
    var code = "//xf_" + routeCode() + "_" + (THEME_LETTER[theme()] || "x") + "_" + layoutClass();
    verticalEl.querySelector(".hud-code").textContent = code;
    verticalEl.querySelector(".hud-path").textContent = window.location.pathname;
    verticalEl.querySelector(".hud-y").textContent = "Y" + pad(scrollPercent(), 3);
  }

  function renderScroll() {
    scrollQueued = false;
    if (verticalEl) verticalEl.querySelector(".hud-y").textContent = "Y" + pad(scrollPercent(), 3);
  }

  function renderFooter() {
    if (!footerEl) return;
    footerEl.textContent = "";

    var build = "//SYS";
    footerEl.appendChild(span("hud-item", build));
    footerEl.appendChild(
      span(
        "hud-item",
        "BUILD " + (meta && meta.version ? meta.version : "---") + (meta && meta.built ? " " + meta.built : "")
      )
    );
    if (meta && meta.rev) footerEl.appendChild(span("hud-item", "REV " + meta.rev));
    footerEl.appendChild(span("hud-item", "THEME " + theme().toUpperCase()));

    var styles = window.getComputedStyle(document.documentElement);
    SWATCHES.forEach(function (entry) {
      var hex = toHex(styles.getPropertyValue(entry[1]));
      var item = span("hud-item hud-swatch");
      var chip = span("hud-chip");
      chip.style.setProperty("--chip", hex);
      item.appendChild(chip);
      item.appendChild(document.createTextNode(entry[0] + " " + hex));
      footerEl.appendChild(item);
    });
  }

  function renderAll() {
    renderVertical();
    renderFooter();
  }

  function build() {
    if (!document.querySelector(".hud-v.hud-page")) {
      verticalEl = document.createElement("div");
      verticalEl.className = "hud hud-v hud-page";
      verticalEl.setAttribute("aria-hidden", "true");
      verticalEl.appendChild(span("hud-code"));
      verticalEl.appendChild(span("hud-sep", "//"));
      verticalEl.appendChild(span("hud-path"));
      verticalEl.appendChild(span("hud-sep", "//"));
      verticalEl.appendChild(span("hud-y"));
      document.body.appendChild(verticalEl);
    }

    var inner = document.querySelector(".site-footer-inner");
    if (inner && !inner.querySelector(".hud-line")) {
      footerEl = document.createElement("p");
      footerEl.className = "hud hud-line";
      footerEl.setAttribute("aria-hidden", "true");
      inner.appendChild(footerEl);
    }

    renderAll();
  }

  function init() {
    build();

    window.addEventListener("resize", renderAll);
    window.addEventListener(
      "scroll",
      function () {
        if (scrollQueued) return;
        scrollQueued = true;
        window.requestAnimationFrame(renderScroll);
      },
      { passive: true }
    );

    new MutationObserver(renderAll).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    fetch("/assets/site-meta.json", { cache: "no-cache" })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (data) {
          meta = data;
          renderFooter();
        }
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
