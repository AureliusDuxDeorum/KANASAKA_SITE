(function () {
  var LOGO_FONT = '600 50px "Tektur"';

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

    Promise.race([fontReady, timeout]).then(callback);
  }

  function activateHeroAmbient() {
    var heroLogo = document.querySelector(".kanasaka-logo--hero");
    if (!heroLogo) {
      window.dispatchEvent(new CustomEvent("kanasaka:hero-ready"));
      return;
    }

    whenLogoReady(heroLogo, function () {
      if (!prefersReducedMotion()) {
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
  };
})();
