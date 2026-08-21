(function () {
  var LOGO_FONT = '600 50px "Tektur"';

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function whenPathsReady(root, callback, attempt) {
    var tries = attempt || 0;
    var paths = root.querySelectorAll(".logo-emission, .logo-line");
    var ready = paths.length > 0;

    paths.forEach(function (path) {
      if (path.getTotalLength() <= 0) {
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

  function prepareEmissionPaths(root) {
    root.querySelectorAll(".logo-emission").forEach(function (path) {
      var length = path.getTotalLength();
      if (length <= 0) {
        return;
      }

      path.style.setProperty("--emission-length", String(length));
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
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
        prepareEmissionPaths(heroLogo);
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
    prepareEmissionPaths: prepareEmissionPaths,
  };
})();
