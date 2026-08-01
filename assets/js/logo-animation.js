(function () {
  var INTRO_KEY = "kanasaka-intro-seen";
  var INTRO_MS = 3400;
  var PULSE_WIDTH = 28;
  var PULSE_DURATION = 3000;
  var PULSE_STAGGER = 0.8;

  var LOGO_SVG =
    '<svg class="kanasaka-logo-svg" viewBox="0 0 480 110" role="img" aria-label="Kanasaka">' +
    "<title>Kanasaka</title>" +
    "<defs>" +
    '<filter id="logo-pulse-glow" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">' +
    '<feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="blur"></feGaussianBlur>' +
    "<feMerge>" +
    '<feMergeNode in="blur"></feMergeNode>' +
    '<feMergeNode in="SourceGraphic"></feMergeNode>' +
    "</feMerge>" +
    "</filter>" +
    "</defs>" +
    '<g class="logo-side logo-side-left">' +
    '<path class="logo-line" d="M 80 40 H 108 L 120 52 H 188"></path>' +
    '<path class="logo-signal" d="M 80 40 H 108 L 120 52 H 188"></path>' +
    '<text class="logo-tag" x="76" y="44" text-anchor="end">Software</text>' +
    '<path class="logo-line" d="M 80 70 H 108 L 120 58 H 188"></path>' +
    '<path class="logo-signal" d="M 80 70 H 108 L 120 58 H 188"></path>' +
    '<text class="logo-tag" x="76" y="74" text-anchor="end">AI</text>' +
    "</g>" +
    '<g class="logo-letters">' +
    '<text class="logo-letter logo-letter-k" x="240" y="38" text-anchor="middle">K</text>' +
    '<text class="logo-letter logo-letter-s" x="240" y="92" text-anchor="middle">S</text>' +
    "</g>" +
    '<g class="logo-side logo-side-right">' +
    '<path class="logo-line" d="M 400 40 H 372 L 360 52 H 292"></path>' +
    '<path class="logo-signal" d="M 400 40 H 372 L 360 52 H 292"></path>' +
    '<text class="logo-tag" x="404" y="44" text-anchor="start">Robotics</text>' +
    '<path class="logo-line" d="M 400 70 H 372 L 360 58 H 292"></path>' +
    '<path class="logo-signal" d="M 400 70 H 372 L 360 58 H 292"></path>' +
    '<text class="logo-tag" x="404" y="74" text-anchor="start">Biotech</text>' +
    "</g>" +
    "</svg>";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function stopSignalAnimations(root) {
    root.querySelectorAll(".logo-signal").forEach(function (line) {
      line.getAnimations().forEach(function (animation) {
        animation.cancel();
      });
    });
  }

  function prepareSignalPulse(line, delayMs) {
    var length = line.getTotalLength();
    var gap = Math.max(length, 1);

    line.style.strokeDasharray = PULSE_WIDTH + " " + gap;
    line.style.strokeDashoffset = String(length);

    line.getAnimations().forEach(function (animation) {
      animation.cancel();
    });

    if (prefersReducedMotion()) {
      line.style.strokeDashoffset = "0";
      return;
    }

    line.animate(
      [{ strokeDashoffset: length }, { strokeDashoffset: -PULSE_WIDTH }],
      {
        duration: PULSE_DURATION,
        delay: delayMs,
        iterations: Infinity,
        easing: "linear",
        fill: "both",
      }
    );
  }

  function prepareLinePaths(root, forDraw) {
    var signalIndex = 0;

    root.querySelectorAll(".logo-line").forEach(function (line, index) {
      var length = line.getTotalLength();
      line.style.setProperty("--line-length", String(length));
      if (forDraw) {
        line.style.strokeDasharray = String(length);
        line.style.strokeDashoffset = String(length);
        line.style.setProperty("--line-delay", String(0.1 + index * 0.14) + "s");
      } else {
        line.style.setProperty("--line-delay", String(index * 0.25) + "s");
      }
    });

    root.querySelectorAll(".logo-signal").forEach(function (line) {
      prepareSignalPulse(line, signalIndex * PULSE_STAGGER * 1000);
      signalIndex += 1;
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
    stopSignalAnimations(logo);
    return splash;
  }

  function activateHeroAmbient() {
    var heroLogo = document.querySelector(".kanasaka-logo--hero");
    if (!heroLogo) {
      return;
    }

    revealHeroLines(heroLogo);
    prepareLinePaths(heroLogo, false);
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
    stopSignalAnimations(heroLogo);
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
