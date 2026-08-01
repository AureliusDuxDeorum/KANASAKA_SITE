(function () {
  var INTRO_KEY = "kanasaka-intro-seen";
  var INTRO_MS = 3400;
  var PULSE_WIDTH = 28;
  var PULSE_HEIGHT = 4;
  var PULSE_DURATION = 3000;
  var PULSE_STAGGER = 0.8;
  var SVG_NS = "http://www.w3.org/2000/svg";

  var LOGO_LETTERS =
    '<g class="logo-letters">' +
    '<text class="logo-letter logo-letter-k" x="240" y="40" text-anchor="middle">K</text>' +
    '<text class="logo-letter logo-letter-s" x="240" y="94" text-anchor="middle">S</text>' +
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
    '<text class="logo-tag" x="76" y="44" text-anchor="end">Software</text>' +
    '<path class="logo-line" d="M 80 70 H 108 L 120 58 H 188"></path>' +
    '<text class="logo-tag" x="76" y="74" text-anchor="end">AI</text>' +
    "</g>" +
    LOGO_LETTERS +
    '<g class="logo-side logo-side-right">' +
    '<path class="logo-line" d="M 400 40 H 372 L 360 52 H 292"></path>' +
    '<text class="logo-tag" x="404" y="44" text-anchor="start">Robotics</text>' +
    '<path class="logo-line" d="M 400 70 H 372 L 360 58 H 292"></path>' +
    '<text class="logo-tag" x="404" y="74" text-anchor="start">Biotech</text>' +
    "</g>" +
    "</svg>";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function getPulseGroup(line) {
    var sibling = line.nextElementSibling;
    if (sibling && sibling.classList.contains("logo-pulse-group")) {
      return sibling;
    }
    return null;
  }

  function ensurePulseGroups(root) {
    root.querySelectorAll(".logo-line").forEach(function (line) {
      if (getPulseGroup(line)) {
        return;
      }

      var group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("class", "logo-pulse-group");

      var pulse = document.createElementNS(SVG_NS, "rect");
      pulse.setAttribute("class", "logo-pulse");
      pulse.setAttribute("width", String(PULSE_WIDTH));
      pulse.setAttribute("height", String(PULSE_HEIGHT));
      pulse.setAttribute("x", String(-PULSE_WIDTH / 2));
      pulse.setAttribute("y", String(-PULSE_HEIGHT / 2));
      pulse.setAttribute("fill", "currentColor");

      group.appendChild(pulse);
      line.parentNode.insertBefore(group, line.nextSibling);
    });
  }

  function stopSignalAnimations(root) {
    root.querySelectorAll(".logo-pulse-group").forEach(function (group) {
      group.dataset.pulseActive = "0";
      if (group._pulseFrameId) {
        window.cancelAnimationFrame(group._pulseFrameId);
        group._pulseFrameId = null;
      }
    });
  }

  function placePulse(group, line, distance) {
    var length = line.getTotalLength();
    var clamped = Math.max(0, Math.min(distance, length));
    var point = line.getPointAtLength(clamped);
    var ahead = line.getPointAtLength(Math.min(clamped + 1, length));
    var angle =
      (Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI;

    group.setAttribute(
      "transform",
      "translate(" + point.x + " " + point.y + ") rotate(" + angle + ")"
    );
  }

  function animatePulseGroup(line, group, delayMs) {
    var length = line.getTotalLength();
    if (length <= 0) {
      return;
    }

    group.dataset.pulseActive = "1";

    if (prefersReducedMotion()) {
      placePulse(group, line, length * 0.5);
      return;
    }

    var startAt = performance.now() + delayMs;

    function frame(now) {
      if (group.dataset.pulseActive !== "1") {
        return;
      }

      var elapsed = now - startAt;
      if (elapsed < 0) {
        group._pulseFrameId = window.requestAnimationFrame(frame);
        return;
      }

      var progress = (elapsed % PULSE_DURATION) / PULSE_DURATION;
      placePulse(group, line, progress * length);
      group._pulseFrameId = window.requestAnimationFrame(frame);
    }

    placePulse(group, line, 0);
    group._pulseFrameId = window.requestAnimationFrame(frame);
  }

  function startSignalAnimations(root) {
    stopSignalAnimations(root);
    ensurePulseGroups(root);

    root.querySelectorAll(".logo-line").forEach(function (line, index) {
      var group = getPulseGroup(line);
      if (!group) {
        return;
      }

      animatePulseGroup(line, group, index * PULSE_STAGGER * 1000);
    });
  }

  function whenPathsReady(root, callback, attempt) {
    var tries = attempt || 0;
    var lines = root.querySelectorAll(".logo-line");
    var ready = lines.length > 0;

    lines.forEach(function (line) {
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
