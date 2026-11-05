// Runs before first paint (synchronous, tiny, cached) so that the very first
// frame of every page already has the right theme and motion attributes:
//   - no flash of the wrong theme,
//   - cross-document page transitions (motion.css) see the same gating on
//     both the old and the new page.
// The full logic lives in motion.js (keep compute() below in sync with it);
// motion.js takes over once it has loaded.
(function () {
  try {
    var root = document.documentElement;
    var store = window.localStorage;

    var theme = store.getItem("kanasaka-theme");
    if (theme !== "light" && theme !== "dark" && theme !== "accent") theme = "dark";
    root.setAttribute("data-theme", theme);

    var pref = store.getItem("kanasaka-motion");
    if (["auto", "full", "reduced", "off"].indexOf(pref) === -1) pref = "auto";

    var connection = navigator.connection;
    var weak = Boolean(connection && connection.saveData); // data saver only (see motion.js)

    var motion;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) motion = "off";
    else if (pref === "auto") motion = weak ? "reduced" : "full";
    else motion = pref;

    root.setAttribute("data-motion", motion);
    root.setAttribute("data-fx", motion === "full" ? (theme === "accent" ? "2" : "1") : "0");
  } catch (e) {
    // storage or matchMedia unavailable: motion.js sets everything later
  }
})();
