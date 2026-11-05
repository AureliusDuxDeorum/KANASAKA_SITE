(function () {
  "use strict";

  // Quiet "console" labels. Everything shown is read from the page or the build:
  //
  //   footer line   //SYS  site version / build date / revision (assets/site-meta.json),
  //                 the active theme and its four real hex codes (live from CSS)
  //   left edge     //xf_<route>_<theme>_<layout>  + route + scroll position
  //
  // Code grammar:  xf_SSP_T_LL
  //   SS  nav section, in header order (00 Home, 01 Products, 02 Downloads ...)
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
  // live readouts (real values only): updated by tickLive() once a second
  var live = {};
  var sessionStart = null;
  var liveTimer = 0;

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
      var direct = items[i].querySelector(":scope > a.nav-link.active");
      if (direct) return pad(i, 2) + "1";
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

  function motionState() {
    var el = document.documentElement;
    return {
      motion: (el.getAttribute("data-motion") || "full").toUpperCase(),
      fx: el.getAttribute("data-fx") || "1",
    };
  }

  function clock(seconds) {
    var d = new Date();
    var text = pad(d.getUTCHours(), 2) + ":" + pad(d.getUTCMinutes(), 2);
    return seconds ? text + ":" + pad(d.getUTCSeconds(), 2) : text;
  }

  function sessionTime() {
    if (sessionStart === null) {
      var stored = null;
      try {
        stored = window.sessionStorage.getItem("kanasaka-session-start");
      } catch (e) {
        stored = null;
      }
      sessionStart = Number(stored) || Date.now();
      try {
        window.sessionStorage.setItem("kanasaka-session-start", String(sessionStart));
      } catch (e) {
        // storage blocked: the timer just starts at this page view
      }
    }
    var total = Math.max(0, Math.floor((Date.now() - sessionStart) / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    return (h ? pad(h, 2) + ":" : "") + pad(m, 2) + ":" + pad(total % 60, 2);
  }

  // Once a second (once a minute when motion is off, so nothing ticks for
  // people who asked for a still page). Text-only updates; fixed-width digits.
  function tickLive() {
    var ms = motionState();
    var still = ms.motion === "OFF";
    if (live.utc) live.utc.textContent = "UTC " + clock(!still);
    if (live.session) live.session.textContent = "SESSION " + (still ? "--:--" : sessionTime());
    if (live.vp) live.vp.textContent = "VP " + window.innerWidth + "x" + window.innerHeight;
    if (live.net) live.net.textContent = "NET " + (navigator.onLine === false ? "OFFLINE" : "ONLINE");
    if (live.motion) live.motion.textContent = "MOTION " + ms.motion + " FX" + ms.fx;
  }

  function startLive() {
    if (liveTimer) window.clearInterval(liveTimer);
    var still = motionState().motion === "OFF";
    liveTimer = window.setInterval(function () {
      if (!document.hidden) tickLive();
    }, still ? 60000 : 1000);
  }

  function renderFooter() {
    if (!footerEl) return;
    footerEl.textContent = "";

    footerEl.appendChild(span("hud-item", "//SYS"));
    footerEl.appendChild(span("hud-item", "VER " + (meta && meta.version ? meta.version : "---")));
    if (meta && meta.built) footerEl.appendChild(span("hud-item", "BUILT " + meta.built));
    if (meta && meta.rev) footerEl.appendChild(span("hud-item", "REV " + meta.rev));
    footerEl.appendChild(span("hud-item", "THEME " + theme().toUpperCase()));

    live = {
      utc: span("hud-item hud-item--live hud-item--live-extra"),
      session: span("hud-item hud-item--live hud-item--live-extra"),
      vp: span("hud-item hud-item--live hud-item--live-extra"),
      net: span("hud-item hud-item--live"),
      motion: span("hud-item hud-item--live"),
    };
    ["utc", "session", "vp", "net", "motion"].forEach(function (key) {
      footerEl.appendChild(live[key]);
    });
    tickLive();

    var styles = window.getComputedStyle(document.documentElement);
    SWATCHES.forEach(function (entry) {
      var hex = toHex(styles.getPropertyValue(entry[1]));
      var item = span("hud-item hud-swatch" + (entry[0] === "SURF" || entry[0] === "LINE" ? " hud-swatch--extra" : ""));
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

    // Accent: the page code ticks once when the page loads (no-op elsewhere)
    if (window.KanasakaMotion && verticalEl) {
      window.KanasakaMotion.glitch(verticalEl.querySelector(".hud-code"), 220);
    }
  }

  function init() {
    build();

    window.addEventListener("resize", function () {
      renderAll();
    });
    window.addEventListener("online", tickLive);
    window.addEventListener("offline", tickLive);
    startLive();
    if (window.KanasakaMotion) {
      window.KanasakaMotion.onChange(function () {
        tickLive();
        startLive();
      });
    }
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
          window.KanasakaMeta = data;
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
