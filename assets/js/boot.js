(function () {
  "use strict";

  // First-visit boot sequence: a short terminal readout (true values only) over
  // the KS mark, once per browser session, then a wipe into the page. The page
  // is already rendered underneath; any key, click or tap skips it. Skipped
  // entirely when motion is reduced/off (data-motion is set by motion-boot.js).
  //
  // Started on demand (terminal BOOT command, Ctrl+B) it runs a longer variant
  // (about 5 s) with more readout lines and a progress bar. Still true values
  // only; the bar just follows the sequence's own timeline.

  var KEY = "kanasaka-booted";
  var SHOW_MS = 780;
  var LINE_MS = 90;
  var LONG_LINE_MS = 190;
  var LONG_START_MS = 450;
  var LONG_BAR_MS = 1300;
  var LONG_HOLD_MS = 500;

  var LOGO_PATH =
    "M0,0 L101.6,0 L101.6,514.4 L615.98,0 L761.75,0 L380.73,380.7 L460.22,460.1 L920.35,0 L1523.6,0 L1523.6,101.8 L964.6,101.8 L863.1,203.08 L863.1,334.88 L1523.6,334.88 L1523.6,606.05 L1371.35,761.85 L615.98,761.85 L460.22,606.05 L307.35,761.85 L0,761.85 Z M761.75,304.45 L761.75,436.43 L1421.9,436.43 L1421.9,565.2 L1326.98,660.12 L659.85,660.12 L533.25,533 Z M307.35,453.7 L387.48,533 L260.35,660.12 L101.6,660.12 Z";

  function seen() {
    try {
      return window.sessionStorage.getItem(KEY) === "1";
    } catch (e) {
      return true; // cannot remember it: do not risk replaying on every page
    }
  }

  function markSeen() {
    try {
      window.sessionStorage.setItem(KEY, "1");
    } catch (e) {
      // see seen()
    }
  }

  function layoutClass() {
    var w = window.innerWidth;
    return w < 768 ? "01" : w < 1024 ? "02" : w < 1700 ? "03" : "04";
  }

  function corrupt(text) {
    var glyphs = "0123456789ABCDEF";
    var chars = text.split("");
    var hits = 1 + ((Math.random() * 2) | 0);
    for (var i = 0; i < hits; i++) {
      var at = 3 + ((Math.random() * Math.max(1, chars.length - 3)) | 0);
      if (chars[at] && chars[at] !== " ") chars[at] = glyphs.charAt((Math.random() * glyphs.length) | 0);
    }
    return chars.join("");
  }

  function timeZone() {
    try {
      return String(Intl.DateTimeFormat().resolvedOptions().timeZone || "---").toUpperCase();
    } catch (e) {
      return "---";
    }
  }

  function storageState() {
    try {
      window.localStorage.setItem("kanasaka-boot-probe", "1");
      window.localStorage.removeItem("kanasaka-boot-probe");
      return "OK";
    } catch (e) {
      return "BLOCKED";
    }
  }

  function sessionState() {
    var auth = window.KanasakaAuth;
    var session = auth && auth.getSession ? auth.getSession() : null;
    return session && session.authenticated ? "SIGNED IN" : "GUEST";
  }

  function start(force) {
    var root = document.documentElement;
    var fx = Number(root.getAttribute("data-fx") || 0);
    if (root.getAttribute("data-motion") !== "full" || fx < 1 || (force !== true && seen())) return;
    if (document.querySelector(".ks-boot")) return;
    markSeen();

    var overlay = document.createElement("div");
    overlay.className = "ks-boot";
    overlay.setAttribute("aria-hidden", "true");
    var long = force === true;
    if (long) overlay.classList.add("ks-boot--long");

    var inner = document.createElement("div");
    inner.className = "ks-boot-inner";

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ks-boot-logo");
    svg.setAttribute("viewBox", "0 0 1523.6 761.85");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("d", LOGO_PATH);
    svg.appendChild(path);

    var lines = document.createElement("div");
    lines.className = "ks-boot-lines";
    inner.appendChild(svg);
    inner.appendChild(lines);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);

    var bar = null;
    if (long) {
      bar = document.createElement("div");
      bar.className = "ks-boot-bar";
      bar.appendChild(document.createElement("span"));
      inner.appendChild(bar);
    }

    var version = "---";
    var rev = "---";
    var built = "---";
    var texts = [];
    function setTexts() {
      var theme = (root.getAttribute("data-theme") || "dark").toUpperCase();
      var motion = root.getAttribute("data-motion").toUpperCase() + " FX" + fx;
      var net = navigator.onLine === false ? "OFFLINE" : "ONLINE";
      if (!long) {
        texts = [
          "//BOOT KANASAKA",
          "//SYS VER " + version,
          "//THEME " + theme,
          "//LAYOUT " + layoutClass(),
          "//MOTION " + motion,
          "//NET " + net,
          "//READY",
        ];
        return;
      }
      texts = [
        "//BOOT KANASAKA",
        "//SYS VER " + version,
        "//REV " + rev,
        "//BUILT " + built,
        "//THEME " + theme,
        "//LAYOUT " + layoutClass(),
        "//VIEWPORT " + window.innerWidth + "X" + window.innerHeight + " @" + (window.devicePixelRatio || 1) + "X",
        "//LANG " + String(navigator.language || "---").toUpperCase(),
        "//TZ " + timeZone(),
        "//MOTION " + motion,
        "//STORAGE " + storageState(),
        "//SESSION " + sessionState(),
        "//NET " + net,
        "//READY",
      ];
    }
    setTexts();

    // version comes from the build stamp (same file hud.js reads); fine without
    try {
      window
        .fetch("/assets/site-meta.json", { cache: "no-cache" })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (data) {
          if (data && data.version) {
            version = data.version;
            if (data.rev) rev = String(data.rev).toUpperCase();
            if (data.built) built = String(data.built);
            setTexts();
          }
        })
        .catch(function () {});
    } catch (e) {
      // no fetch: version stays ---
    }
    var timeouts = [];
    var done = false;

    function later(fn, ms) {
      timeouts.push(window.setTimeout(fn, ms));
    }

    function finish(fast) {
      if (done) return;
      done = true;
      timeouts.forEach(window.clearTimeout);
      overlay.classList.add("is-out");
      window.setTimeout(function () {
        overlay.remove();
      }, fast ? 180 : 200);
      document.removeEventListener("keydown", skip, true);
      overlay.removeEventListener("pointerdown", skip);
    }

    function skip() {
      finish(true);
    }

    document.addEventListener("keydown", skip, true);
    overlay.addEventListener("pointerdown", skip);

    window.requestAnimationFrame(function () {
      overlay.classList.add("is-on");
      if (window.KanasakaMotion) window.KanasakaMotion.glitch(inner, 160);
    });

    for (var i = 0; i < texts.length; i++) {
      (function (index) {
        later(function () {
          var line = document.createElement("p");
          line.className = "ks-boot-line";
          var real = texts[index];
          // Accent: a line arrives corrupted and resolves a beat later
          if (fx >= 2 && index > 0 && index < texts.length - 1) {
            line.textContent = corrupt(real);
            later(function () {
              line.textContent = texts[index];
            }, 80);
          } else {
            line.textContent = real;
          }
          lines.appendChild(line);
        }, (long ? LONG_START_MS + index * LONG_LINE_MS : 120 + index * LINE_MS));
      })(i);
    }

    if (long) {
      // the bar fills after the last line has arrived, then a short hold, then the wipe
      var barAt = LONG_START_MS + texts.length * LONG_LINE_MS;
      later(function () {
        bar.classList.add("is-fill");
      }, barAt);
      later(function () {
        finish(false);
      }, barAt + LONG_BAR_MS + LONG_HOLD_MS);
      return;
    }

    later(function () {
      finish(false);
    }, SHOW_MS);
  }

  // the terminal's BOOT command replays it on demand
  window.KanasakaBoot = {
    play: function () {
      start(true);
    },
  };

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", function () {
    start();
  });
})();
