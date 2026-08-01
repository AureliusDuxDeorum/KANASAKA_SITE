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
    '<g class="logo-letters"><g transform="translate(215, 4) scale(1.022)"><g class="logo-letter logo-letter-k"><path d="M0,8h1v1h-1zM0,9h1v1h-1zM0,10h1v1h-1zM14,10h10v1h-10zM0,11h1v1h-1zM14,11h10v1h-10zM0,12h1v1h-1zM14,12h10v1h-10zM0,13h1v1h-1zM14,13h10v1h-10zM48,13h1v1h-1zM0,14h1v1h-1zM14,14h11v1h-11zM46,14h3v1h-3zM0,15h1v1h-1zM14,15h11v1h-11zM45,15h4v1h-4zM0,16h1v1h-1zM14,16h11v1h-11zM43,16h6v1h-6zM0,17h1v1h-1zM14,17h12v1h-12zM42,17h7v1h-7zM0,18h1v1h-1zM14,18h14v1h-14zM40,18h9v1h-9zM0,19h1v1h-1zM14,19h15v1h-15zM39,19h10v1h-10zM0,20h1v1h-1zM14,20h16v1h-16zM38,20h11v1h-11zM0,21h1v1h-1zM14,21h18v1h-18zM36,21h13v1h-13zM0,22h1v1h-1zM14,22h35v1h-35zM0,23h1v1h-1zM14,23h35v1h-35zM0,24h1v1h-1zM14,24h35v1h-35zM0,25h1v1h-1zM14,25h33v1h-33zM0,26h1v1h-1zM14,26h32v1h-32zM0,27h1v1h-1zM14,27h30v1h-30zM0,28h1v1h-1zM14,28h29v1h-29zM0,29h1v1h-1zM14,29h10v1h-10zM26,29h18v1h-18zM0,30h1v1h-1zM14,30h10v1h-10zM28,30h17v1h-17zM0,31h1v1h-1zM14,31h10v1h-10zM29,31h18v1h-18zM0,32h1v1h-1zM14,32h10v1h-10zM31,32h17v1h-17zM0,33h1v1h-1zM14,33h10v1h-10zM32,33h17v1h-17zM0,34h1v1h-1zM14,34h10v1h-10zM34,34h15v1h-15zM0,35h1v1h-1zM14,35h10v1h-10zM35,35h14v1h-14zM0,36h1v1h-1zM14,36h10v1h-10zM37,36h12v1h-12zM0,37h1v1h-1zM14,37h10v1h-10zM38,37h11v1h-11zM0,38h1v1h-1zM14,38h10v1h-10zM40,38h9v1h-9zM0,39h1v1h-1zM14,39h10v1h-10zM41,39h8v1h-8zM0,40h1v1h-1zM14,40h10v1h-10zM43,40h6v1h-6zM0,41h1v1h-1zM14,41h10v1h-10zM44,41h5v1h-5zM0,42h1v1h-1zM14,42h10v1h-10zM46,42h3v1h-3zM0,43h1v1h-1zM14,43h10v1h-10zM47,43h2v1h-2zM0,44h1v1h-1zM14,44h10v1h-10zM48,44h1v1h-1z"></path></g></g><g transform="translate(215, 56) scale(1.211)"><g class="logo-letter logo-letter-s"><path d="M0,0h40v1h-40zM0,1h41v1h-41zM0,2h41v1h-41zM0,3h41v1h-41zM0,4h41v1h-41zM0,5h41v1h-41zM0,6h41v1h-41zM0,7h41v1h-41zM0,8h41v1h-41zM0,9h41v1h-41zM0,10h10v1h-10zM13,10h17v1h-17zM0,11h10v1h-10zM14,11h18v1h-18zM0,12h10v1h-10zM16,12h17v1h-17zM0,13h10v1h-10zM17,13h18v1h-18zM0,14h11v1h-11zM19,14h17v1h-17zM0,15h13v1h-13zM20,15h17v1h-17zM0,16h14v1h-14zM22,16h17v1h-17zM0,17h16v1h-16zM23,17h17v1h-17zM0,18h17v1h-17zM25,18h16v1h-16zM1,19h18v1h-18zM26,19h15v1h-15zM3,20h17v1h-17zM28,20h13v1h-13zM4,21h18v1h-18zM29,21h12v1h-12zM6,22h17v1h-17zM30,22h11v1h-11zM7,23h17v1h-17zM30,23h11v1h-11zM9,24h17v1h-17zM30,24h11v1h-11zM10,25h16v1h-16zM30,25h11v1h-11zM29,26h12v1h-12zM28,27h13v1h-13zM0,28h41v1h-41zM0,29h41v1h-41zM0,30h41v1h-41zM0,31h40v1h-40zM0,32h39v1h-39zM0,33h39v1h-39zM0,34h37v1h-37zM0,35h36v1h-36zM0,36h35v1h-35zM0,37h32v1h-32z"></path></g></g></g>' +
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
      line.dataset.pulseActive = "0";
      if (line._pulseFrameId) {
        window.cancelAnimationFrame(line._pulseFrameId);
        line._pulseFrameId = null;
      }
    });
  }

  function configureSignalLine(line) {
    var length = line.getTotalLength();
    if (length <= 0) {
      return 0;
    }

    line.dataset.pathLength = String(length);
    line.style.strokeDasharray = PULSE_WIDTH + " " + length;
    line.style.strokeDashoffset = String(length);
    return length;
  }

  function animateSignalLine(line, length, delayMs) {
    if (prefersReducedMotion()) {
      line.style.strokeDashoffset = "0";
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
      line.style.strokeDashoffset = String(length - progress * travel);
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
      prepareLinePaths(heroLogo, false);
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
