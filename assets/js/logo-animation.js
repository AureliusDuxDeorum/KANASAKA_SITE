(function () {
  var INTRO_KEY = "kanasaka-intro-seen";
  var INTRO_MS = 3600;

  var LOGO_SVG =
    '<svg class="kanasaka-logo-svg" viewBox="0 0 360 100" role="img" aria-label="Kanasaka">' +
    "<title>Kanasaka</title>" +
    '<g class="logo-circuit logo-circuit-left">' +
    '<path class="logo-line" d="M 0 36 H 78 L 104 46 H 128"></path>' +
    '<path class="logo-line" d="M 0 64 H 78 L 104 54 H 128"></path>' +
    '<path class="logo-signal logo-signal-left-top" d="M 0 36 H 78 L 104 46 H 128"></path>' +
    '<path class="logo-signal logo-signal-left-bottom" d="M 0 64 H 78 L 104 54 H 128"></path>' +
    "</g>" +
    '<g class="logo-letters">' +
    '<text class="logo-letter logo-letter-k" x="180" y="42" text-anchor="middle">K</text>' +
    '<text class="logo-letter logo-letter-s" x="180" y="78" text-anchor="middle">S</text>' +
    "</g>" +
    '<g class="logo-circuit logo-circuit-right">' +
    '<path class="logo-line" d="M 360 36 H 282 L 256 46 H 232"></path>' +
    '<path class="logo-line" d="M 360 64 H 282 L 256 54 H 232"></path>' +
    '<path class="logo-signal logo-signal-right-top" d="M 360 36 H 282 L 256 46 H 232"></path>' +
    '<path class="logo-signal logo-signal-right-bottom" d="M 360 64 H 282 L 256 54 H 232"></path>' +
    "</g>" +
    "</svg>";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function prepareLinePaths(root, forDraw) {
    root.querySelectorAll(".logo-line").forEach(function (line, index) {
      var length = line.getTotalLength();
      line.style.setProperty("--line-length", String(length));
      if (forDraw) {
        line.style.strokeDasharray = String(length);
        line.style.strokeDashoffset = String(length);
        line.style.setProperty("--line-delay", String(0.08 + index * 0.12) + "s");
      }
    });

    root.querySelectorAll(".logo-signal").forEach(function (line, index) {
      var length = line.getTotalLength();
      line.style.setProperty("--line-length", String(length));
      line.style.strokeDasharray = "42 " + Math.max(length - 42, 1);
      line.style.setProperty("--signal-delay", String(index * 0.55) + "s");
    });
  }

  function revealHeroLines(heroLogo) {
    heroLogo.querySelectorAll(".logo-line").forEach(function (line) {
      line.style.strokeDashoffset = "0";
      line.style.strokeDasharray = "none";
    });
  }

  function buildSplash() {
    var splash = document.createElement("div");
    splash.id = "site-splash";
    splash.className = "site-splash";
    splash.setAttribute("aria-hidden", "true");

    var inner = document.createElement("div");
    inner.className = "site-splash-inner";

    var logo = document.createElement("div");
    logo.className = "kanasaka-logo kanasaka-logo--splash";

    var heroLogo = document.querySelector(".kanasaka-logo--hero");
    logo.innerHTML = heroLogo ? heroLogo.innerHTML : LOGO_SVG;

    inner.appendChild(logo);
    splash.appendChild(inner);
    document.body.appendChild(splash);

    prepareLinePaths(logo, true);
    return splash;
  }

  function activateHeroAmbient() {
    var heroLogo = document.querySelector(".kanasaka-logo--hero");
    if (!heroLogo) {
      return;
    }

    revealHeroLines(heroLogo);
    heroLogo.classList.add("is-ambient");
  }

  function finishIntro(splash) {
    document.body.classList.remove("splash-active");
    document.body.classList.add("splash-complete");

    splash.classList.add("is-exiting");

    window.setTimeout(function () {
      splash.remove();
      sessionStorage.setItem(INTRO_KEY, "1");

      var heroLogo = document.querySelector(".kanasaka-logo--hero");
      if (heroLogo) {
        activateHeroAmbient();
      }
    }, 650);
  }

  function runIntro() {
    if (prefersReducedMotion() || sessionStorage.getItem(INTRO_KEY) === "1") {
      activateHeroAmbient();
      document.body.classList.add("splash-complete");
      return;
    }

    var splash = buildSplash();
    document.body.classList.add("splash-active");

    window.requestAnimationFrame(function () {
      splash.classList.add("is-playing");
    });

    window.setTimeout(function () {
      finishIntro(splash);
    }, INTRO_MS);
  }

  function initHeroLogo() {
    var heroLogo = document.querySelector(".kanasaka-logo--hero");
    if (!heroLogo) {
      return;
    }

    prepareLinePaths(heroLogo, false);
  }

  function init() {
    initHeroLogo();
    runIntro();
  }

  window.KanasakaLogoAnimation = {
    init: init,
    prepareLinePaths: prepareLinePaths,
  };
})();
