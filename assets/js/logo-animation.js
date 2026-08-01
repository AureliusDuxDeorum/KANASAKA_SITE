(function () {
  var INTRO_KEY = "kanasaka-intro-seen";
  var INTRO_MS = 3400;

  var LOGO_SVG =
    '<svg class="kanasaka-logo-svg" viewBox="0 0 480 100" role="img" aria-label="Kanasaka">' +
    "<title>Kanasaka</title>" +
    '<g class="logo-side logo-side-left">' +
    '<path class="logo-line" d="M 80 36 H 158 L 184 46 H 188"></path>' +
    '<text class="logo-tag" x="76" y="40" text-anchor="end">Software</text>' +
    '<path class="logo-line" d="M 80 64 H 158 L 184 54 H 188"></path>' +
    '<text class="logo-tag" x="76" y="68" text-anchor="end">AI</text>' +
    "</g>" +
    '<g class="logo-letters">' +
    '<text class="logo-letter logo-letter-k" x="240" y="42" text-anchor="middle">K</text>' +
    '<text class="logo-letter logo-letter-s" x="240" y="78" text-anchor="middle">S</text>' +
    "</g>" +
    '<g class="logo-side logo-side-right">' +
    '<path class="logo-line" d="M 400 36 H 322 L 296 46 H 292"></path>' +
    '<text class="logo-tag" x="404" y="40" text-anchor="start">Robotics</text>' +
    '<path class="logo-line" d="M 400 64 H 322 L 296 54 H 292"></path>' +
    '<text class="logo-tag" x="404" y="68" text-anchor="start">Biotech</text>' +
    "</g>" +
    "</svg>";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function prepareLinePaths(root, forDraw) {
    root.querySelectorAll(".logo-line").forEach(function (line, index) {
      var length = line.getTotalLength();
      line.style.setProperty("--line-length", String(length));
      line.style.setProperty("--line-delay", String(index * 0.25) + "s");
      if (forDraw) {
        line.style.strokeDasharray = String(length);
        line.style.strokeDashoffset = String(length);
      }
    });
  }

  function revealHeroLines(heroLogo) {
    heroLogo.querySelectorAll(".logo-line").forEach(function (line) {
      line.style.strokeDashoffset = "0";
      line.style.strokeDasharray = "none";
    });
    heroLogo.querySelectorAll(".logo-tag").forEach(function (tag) {
      tag.style.opacity = "1";
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
