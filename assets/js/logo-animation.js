(function () {
  var HERO_ENTRANCE_MS = 1650;
  var PULSE_SEGMENT = 10;
  var LOGO_FONT = '600 50px "Tektur"';

  var LOGO_LETTERS =
    '<g class="logo-letters">' +
    '<text class="logo-letter logo-letter-k" x="240" y="46" text-anchor="middle" font-family="Tektur, sans-serif" font-size="50" font-weight="600">K</text>' +
    '<text class="logo-letter logo-letter-s" x="240" y="100" text-anchor="middle" font-family="Tektur, sans-serif" font-size="50" font-weight="600">S</text>' +
    "</g>";

  var LOGO_SVG =
    '<svg class="kanasaka-logo-svg" viewBox="0 0 480 110" role="img" aria-label="Kanasaka">' +
    "<title>Kanasaka</title>" +
    '<defs><filter id="logo-signal-glow" x="-140%" y="-140%" width="380%" height="380%" color-interpolation-filters="sRGB">' +
    '<feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="blur"></feGaussianBlur>' +
    '<feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>' +
    "</filter></defs>" +
    '<g class="logo-side logo-side-left">' +
    '<path class="logo-line" d="M 80 40 H 108 L 120 52 H 188"></path>' +
    '<g class="logo-signal-wrap" filter="url(#logo-signal-glow)"><path class="logo-signal" d="M 80 40 H 108 L 120 52 H 188"></path></g>' +
    '<text class="logo-tag" x="76" y="44" text-anchor="end">Software</text>' +
    '<path class="logo-line" d="M 80 70 H 108 L 120 58 H 188"></path>' +
    '<g class="logo-signal-wrap" filter="url(#logo-signal-glow)"><path class="logo-signal" d="M 80 70 H 108 L 120 58 H 188"></path></g>' +
    '<text class="logo-tag" x="76" y="74" text-anchor="end">AI</text>' +
    "</g>" +
    LOGO_LETTERS +
    '<g class="logo-side logo-side-right">' +
    '<path class="logo-line" d="M 400 40 H 372 L 360 52 H 292"></path>' +
    '<g class="logo-signal-wrap" filter="url(#logo-signal-glow)"><path class="logo-signal" d="M 400 40 H 372 L 360 52 H 292"></path></g>' +
    '<text class="logo-tag" x="404" y="44" text-anchor="start">Robotics</text>' +
    '<path class="logo-line" d="M 400 70 H 372 L 360 58 H 292"></path>' +
    '<g class="logo-signal-wrap" filter="url(#logo-signal-glow)"><path class="logo-signal" d="M 400 70 H 372 L 360 58 H 292"></path></g>' +
    '<text class="logo-tag" x="404" y="74" text-anchor="start">Biotech</text>' +
    "</g>" +
    "</svg>";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function getSignalWrap(line) {
    var node = line.nextElementSibling;
    while (node) {
      if (node.classList && node.classList.contains("logo-signal-wrap")) {
        return node;
      }
      if (node.classList && node.classList.contains("logo-line")) {
        break;
      }
      node = node.nextElementSibling;
    }
    return null;
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

  function whenLogoReady(root, callback) {
    var fontReady = document.fonts && document.fonts.load
      ? document.fonts.load(LOGO_FONT).catch(function () {
          return undefined;
        })
      : Promise.resolve();

    var timeout = new Promise(function (resolve) {
      window.setTimeout(resolve, 400);
    });

    Promise.race([fontReady, timeout]).then(function () {
      whenPathsReady(root, callback);
    });
  }

  function prepareLinePaths(root, forDraw) {
    root.querySelectorAll(".logo-line").forEach(function (line, index) {
      var length = line.getTotalLength();
      line.style.setProperty("--line-length", String(length));
      if (forDraw) {
        line.style.strokeDasharray = String(length);
        line.style.strokeDashoffset = String(length);
        line.style.setProperty("--line-delay", String(0.08 + index * 0.11) + "s");
      } else {
        line.style.setProperty("--line-delay", String(index * 0.18) + "s");
      }
    });
  }

  function prepareSignalPaths(root) {
    root.querySelectorAll(".logo-line").forEach(function (line, lineIndex) {
      var wrap = getSignalWrap(line);
      if (!wrap) {
        return;
      }

      var signal = wrap.querySelector(".logo-signal");
      if (!signal) {
        return;
      }

      var length = signal.getTotalLength();
      if (length <= 0) {
        return;
      }

      var gap = length + PULSE_SEGMENT;
      wrap.style.setProperty("--pulse-delay", String(lineIndex * 1.05) + "s");
      signal.style.setProperty("--signal-start", String(length));
      signal.style.setProperty("--signal-end", String(-length));
      signal.style.strokeDasharray = PULSE_SEGMENT + " " + gap;
      signal.style.strokeDashoffset = String(length);
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

  function activateHeroAmbient() {
    var heroLogo = document.querySelector(".kanasaka-logo--hero");
    if (!heroLogo) {
      document.body.classList.add("splash-complete");
      window.dispatchEvent(new CustomEvent("kanasaka:hero-ready"));
      return;
    }

    whenLogoReady(heroLogo, function () {
      if (prefersReducedMotion()) {
        revealHeroLines(heroLogo);
        prepareSignalPaths(heroLogo);
        heroLogo.classList.add("is-ambient");
        document.body.classList.add("splash-complete");
        window.dispatchEvent(new CustomEvent("kanasaka:hero-ready"));
        return;
      }

      prepareLinePaths(heroLogo, true);
      heroLogo.classList.add("is-playing");

      window.requestAnimationFrame(function () {
        window.setTimeout(function () {
          revealHeroLines(heroLogo);
          prepareSignalPaths(heroLogo);
          heroLogo.classList.remove("is-playing");
          heroLogo.classList.add("is-ambient");
          document.body.classList.add("splash-complete");
          window.dispatchEvent(new CustomEvent("kanasaka:hero-ready"));
        }, HERO_ENTRANCE_MS);
      });
    });
  }

  function initHeroLogo() {
    var heroLogo = document.querySelector(".kanasaka-logo--hero");
    if (!heroLogo) {
      return;
    }

    whenLogoReady(heroLogo, function () {
      prepareLinePaths(heroLogo, false);
    });
  }

  function init() {
    initHeroLogo();
    activateHeroAmbient();
  }

  window.KanasakaLogoAnimation = {
    init: init,
    prepareLinePaths: prepareLinePaths,
    prepareSignalPaths: prepareSignalPaths,
  };
})();
