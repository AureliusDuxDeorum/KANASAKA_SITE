(function () {
  var INTRO_KEY = "kanasaka-intro-seen";
  var INTRO_MS = 5200;

  var LOGO_SVG =
    '<svg class="kanasaka-logo-svg" viewBox="0 0 360 152" role="img" aria-label="Kanasaka">' +
    "<title>Kanasaka</title>" +
    '<g class="logo-circuit logo-circuit-left">' +
    '<path class="logo-branch logo-branch-outer" d="M 0 36 H 78 L 104 46 H 128"></path>' +
    '<path class="logo-branch logo-branch-outer" d="M 0 64 H 78 L 104 54 H 128"></path>' +
    '<path class="logo-branch logo-branch-fork" d="M 78 36 L 78 18 L 48 18"></path>' +
    '<path class="logo-branch logo-branch-fork" d="M 78 64 L 78 82 L 48 82"></path>' +
    '<path class="logo-branch logo-branch-fork" d="M 0 36 L 0 20 L 28 20"></path>' +
    '<path class="logo-branch logo-branch-fork" d="M 0 64 L 0 80 L 28 80"></path>' +
    '<path class="logo-line" d="M 0 36 H 78 L 104 46 H 128"></path>' +
    '<path class="logo-line" d="M 0 64 H 78 L 104 54 H 128"></path>' +
    '<path class="logo-flow" d="M 0 36 H 78 L 104 46 H 128"></path>' +
    '<path class="logo-flow" d="M 0 64 H 78 L 104 54 H 128"></path>' +
    '<path class="logo-flow logo-flow-branch" d="M 78 36 L 78 18 L 48 18"></path>' +
    '<path class="logo-flow logo-flow-branch" d="M 78 64 L 78 82 L 48 82"></path>' +
    '<path class="logo-signal" d="M 0 36 H 78 L 104 46 H 128"></path>' +
    '<path class="logo-signal" d="M 0 64 H 78 L 104 54 H 128"></path>' +
    '<path class="logo-signal logo-signal-branch" d="M 78 36 L 78 18 L 48 18"></path>' +
    '<path class="logo-signal logo-signal-branch" d="M 78 64 L 78 82 L 48 82"></path>' +
    "</g>" +
    '<g class="logo-letters">' +
    '<text class="logo-letter logo-letter-k" x="180" y="42" text-anchor="middle">K</text>' +
    '<text class="logo-letter logo-letter-s" x="180" y="78" text-anchor="middle">S</text>' +
    "</g>" +
    '<g class="logo-circuit logo-circuit-right">' +
    '<path class="logo-branch logo-branch-outer" d="M 360 36 H 282 L 256 46 H 232"></path>' +
    '<path class="logo-branch logo-branch-outer" d="M 360 64 H 282 L 256 54 H 232"></path>' +
    '<path class="logo-branch logo-branch-fork" d="M 282 36 L 282 18 L 312 18"></path>' +
    '<path class="logo-branch logo-branch-fork" d="M 282 64 L 282 82 L 312 82"></path>' +
    '<path class="logo-branch logo-branch-fork" d="M 360 36 L 360 20 L 332 20"></path>' +
    '<path class="logo-branch logo-branch-fork" d="M 360 64 L 360 80 L 332 80"></path>' +
    '<path class="logo-line" d="M 360 36 H 282 L 256 46 H 232"></path>' +
    '<path class="logo-line" d="M 360 64 H 282 L 256 54 H 232"></path>' +
    '<path class="logo-flow" d="M 360 36 H 282 L 256 46 H 232"></path>' +
    '<path class="logo-flow" d="M 360 64 H 282 L 256 54 H 232"></path>' +
    '<path class="logo-flow logo-flow-branch" d="M 282 36 L 282 18 L 312 18"></path>' +
    '<path class="logo-flow logo-flow-branch" d="M 282 64 L 282 82 L 312 82"></path>' +
    '<path class="logo-signal" d="M 360 36 H 282 L 256 46 H 232"></path>' +
    '<path class="logo-signal" d="M 360 64 H 282 L 256 54 H 232"></path>' +
    '<path class="logo-signal logo-signal-branch" d="M 282 36 L 282 18 L 312 18"></path>' +
    '<path class="logo-signal logo-signal-branch" d="M 282 64 L 282 82 L 312 82"></path>' +
    "</g>" +
    '<g class="logo-tags">' +
    '<path class="logo-tag-line" d="M 180 88 V 104"></path>' +
    '<path class="logo-tag-line logo-tag-bus" d="M 42 104 H 318"></path>' +
    '<path class="logo-tag-line" d="M 42 104 V 114"></path>' +
    '<path class="logo-tag-line" d="M 134 104 V 114"></path>' +
    '<path class="logo-tag-line" d="M 226 104 V 114"></path>' +
    '<path class="logo-tag-line" d="M 318 104 V 114"></path>' +
    '<path class="logo-tag-flow" d="M 42 104 H 318"></path>' +
    '<text class="logo-tag" x="42" y="130" text-anchor="middle">Software</text>' +
    '<text class="logo-tag" x="134" y="130" text-anchor="middle">AI</text>' +
    '<text class="logo-tag" x="226" y="130" text-anchor="middle">Robotics</text>' +
    '<text class="logo-tag" x="318" y="130" text-anchor="middle">Biotech</text>' +
    "</g>" +
    "</svg>";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function prepareLinePaths(root, forDraw) {
    var lineIndex = 0;
    var flowIndex = 0;
    var signalIndex = 0;

    root.querySelectorAll(".logo-branch").forEach(function (line, index) {
      var length = line.getTotalLength();
      line.style.setProperty("--line-length", String(length));
      var isOuter = line.classList.contains("logo-branch-outer");
      line.style.setProperty(
        "--branch-delay",
        String(isOuter ? index * 0.12 : 0.45 + index * 0.1) + "s"
      );
      if (forDraw) {
        line.style.strokeDasharray = String(length);
        line.style.strokeDashoffset = String(length);
      }
    });

    root.querySelectorAll(".logo-line").forEach(function (line) {
      var length = line.getTotalLength();
      line.style.setProperty("--line-length", String(length));
      if (forDraw) {
        line.style.strokeDasharray = String(length);
        line.style.strokeDashoffset = String(length);
        line.style.setProperty("--line-delay", String(0.95 + lineIndex * 0.1) + "s");
        lineIndex += 1;
      }
    });

    root.querySelectorAll(".logo-tag-line").forEach(function (line, index) {
      var length = line.getTotalLength();
      line.style.setProperty("--line-length", String(length));
      if (forDraw) {
        line.style.strokeDasharray = String(length);
        line.style.strokeDashoffset = String(length);
        line.style.setProperty("--tag-delay", String(1.55 + index * 0.08) + "s");
      }
    });

    root.querySelectorAll(".logo-signal").forEach(function (line) {
      var length = line.getTotalLength();
      line.style.setProperty("--line-length", String(length));
      line.style.strokeDasharray = "28 " + Math.max(length - 28, 1);
      line.style.setProperty("--signal-delay", String(signalIndex * 0.35) + "s");
      signalIndex += 1;
    });

    root.querySelectorAll(".logo-flow").forEach(function (line) {
      var length = line.getTotalLength();
      line.style.setProperty("--line-length", String(length));
      line.style.strokeDasharray = "8 16";
      line.style.setProperty("--flow-delay", String(flowIndex * 0.22) + "s");
      flowIndex += 1;
    });

    root.querySelectorAll(".logo-tag-flow").forEach(function (line) {
      var length = line.getTotalLength();
      line.style.setProperty("--line-length", String(length));
      line.style.strokeDasharray = "12 20";
    });
  }

  function revealHeroLines(heroLogo) {
    heroLogo.querySelectorAll(".logo-line, .logo-branch, .logo-tag-line").forEach(function (line) {
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
