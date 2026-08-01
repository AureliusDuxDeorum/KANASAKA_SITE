(function () {
  var INTRO_KEY = "kanasaka-intro-seen";
  var INTRO_MS = 3400;
  var PULSE_WIDTH = 28;
  var PULSE_DURATION = 3000;
  var PULSE_STAGGER = 0.8;

  var LOGO_K_PATH =
    "M 4 1 H 15 V 49 H 4 Z M 15 24 L 30 1 H 49 V 12 L 33 24 H 15 Z M 15 27 H 33 L 49 49 V 38 L 32 27 H 15 Z";
  var LOGO_S_PATH =
    "M 4 3 H 48 V 11 H 12 L 24 24 H 48 V 33 H 16 L 28 45 H 4 V 37 H 36 L 24 24 H 4 V 3 Z";

  var LOGO_LETTERS =
    '<g class="logo-letters">' +
    '<g class="logo-letter logo-letter-k" transform="translate(214, 4) scale(0.92)">' +
    '<path d="' +
    LOGO_K_PATH +
    '"></path>' +
    "</g>" +
    '<g class="logo-letter logo-letter-s" transform="translate(214, 56) scale(0.92)">' +
    '<path d="' +
    LOGO_S_PATH +
    '"></path>' +
    "</g>" +
    "</g>";

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
    LOGO_LETTERS +
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

  function clearSignalAnimations(line) {
    line.querySelectorAll("animate").forEach(function (node) {
      node.remove();
    });
  }

  function stopSignalAnimations(root) {
    root.querySelectorAll(".logo-signal").forEach(function (line) {
      line.dataset.pulseActive = "0";
      if (line._pulseFrameId) {
        window.cancelAnimationFrame(line._pulseFrameId);
        line._pulseFrameId = null;
      }
      clearSignalAnimations(line);
    });
  }

  function applyDashState(line, length, offset) {
    var dasharray = PULSE_WIDTH + " " + length;
    line.setAttribute("stroke-dasharray", dasharray);
    line.setAttribute("stroke-dashoffset", String(offset));
    line.style.strokeDasharray = dasharray;
    line.style.strokeDashoffset = String(offset);
  }

  function configureSignalLine(line) {
    var length = line.getTotalLength();
    if (length <= 0) {
      return 0;
    }

    line.dataset.pathLength = String(length);
    applyDashState(line, length, length);
    return length;
  }

  function animateSignalLine(line, length, delayMs) {
    clearSignalAnimations(line);
    applyDashState(line, length, length);

    if (prefersReducedMotion()) {
      applyDashState(line, length, 0);
      return;
    }

    var travel = length + PULSE_WIDTH;
    var startAt = performance.now() + delayMs;

    line.dataset.pulseActive = "1";

    function frame(now) {
      if (line.dataset.pulseActive !== "1") {
        return;
      }

      var elapsed = now - startAt;
      if (elapsed < 0) {
        line._pulseFrameId = window.requestAnimationFrame(frame);
        return;
      }

      var progress = (elapsed % PULSE_DURATION) / PULSE_DURATION;
      applyDashState(line, length, length - progress * travel);
      line._pulseFrameId = window.requestAnimationFrame(frame);
    }

    line._pulseFrameId = window.requestAnimationFrame(frame);
  }

  function startSignalAnimations(root) {
    stopSignalAnimations(root);

    root.querySelectorAll(".logo-signal").forEach(function (line, index) {
      var length = configureSignalLine(line);
      if (length <= 0) {
        return;
      }

      animateSignalLine(line, length, index * PULSE_STAGGER * 1000);
    });
  }

  function whenPathsReady(root, callback, attempt) {
    var tries = attempt || 0;
    var signals = root.querySelectorAll(".logo-signal");
    var ready = signals.length > 0;

    signals.forEach(function (line) {
      if (line.getTotalLength() <= 0) {
        ready = false;
      }
    });

    if (ready || tries > 40) {
      callback();
      return;
    }

    window.requestAnimationFrame(function () {
      whenPathsReady(root, callback, tries + 1);
    });
  }

  function prepareLinePaths(root, forDraw) {
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
      configureSignalLine(line);
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

    whenPathsReady(heroLogo, function () {
      startSignalAnimations(heroLogo);
    });
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

    whenPathsReady(heroLogo, function () {
      prepareLinePaths(heroLogo, false);
    });
  }

  function init() {
    initHeroLogo();
    runIntro();
  }

  window.KanasakaLogoAnimation = {
    init: init,
    prepareLinePaths: prepareLinePaths,
    startSignalAnimations: startSignalAnimations,
  };
})();
