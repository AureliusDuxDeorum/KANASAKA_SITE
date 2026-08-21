(function () {
  var PULSE_SEGMENT = 5;
  var LOGO_FONT = '600 50px "Tektur"';

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
      window.setTimeout(resolve, 300);
    });

    Promise.race([fontReady, timeout]).then(function () {
      whenPathsReady(root, callback);
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
      wrap.style.setProperty("--pulse-delay", String(lineIndex * 1.75) + "s");
      signal.style.setProperty("--signal-start", String(length));
      signal.style.setProperty("--signal-end", String(-length));
      signal.style.strokeDasharray = PULSE_SEGMENT + " " + gap;
      signal.style.strokeDashoffset = String(length);
    });
  }

  function activateHeroAmbient() {
    var heroLogo = document.querySelector(".kanasaka-logo--hero");
    if (!heroLogo) {
      window.dispatchEvent(new CustomEvent("kanasaka:hero-ready"));
      return;
    }

    whenLogoReady(heroLogo, function () {
      if (!prefersReducedMotion()) {
        prepareSignalPaths(heroLogo);
        heroLogo.classList.add("is-ambient");
      }

      window.dispatchEvent(new CustomEvent("kanasaka:hero-ready"));
    });
  }

  function init() {
    activateHeroAmbient();
  }

  window.KanasakaLogoAnimation = {
    init: init,
    prepareSignalPaths: prepareSignalPaths,
  };
})();
