(function () {
  "use strict";

  var LOOP_SECONDS = 70;
  var SMOOTHING = 0.16;

  function init() {
    var showcase = document.querySelector(".showcase");
    var track = showcase && showcase.querySelector(".showcase-track");
    var groups = track && track.querySelectorAll(".showcase-group");
    if (!showcase || !track || !groups || groups.length < 2) return;

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    showcase.classList.add("showcase--js");

    var groupWidth = groups[0].getBoundingClientRect().width;
    var offset = 0;
    var target = 0;
    var hovered = false;
    var focused = false;
    var visible = true;
    var rafId = 0;
    var last = 0;

    function wrap(value) {
      if (!groupWidth) return 0;
      return ((value % groupWidth) + groupWidth) % groupWidth;
    }

    function apply() {
      track.style.transform = "translate3d(" + -offset.toFixed(2) + "px,0,0)";
    }

    function frame(now) {
      rafId = 0;
      var dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      if (hovered) {
        offset += (target - offset) * SMOOTHING;
      } else if (!focused) {
        offset += (groupWidth / LOOP_SECONDS) * dt;
        target = offset;
      }

      // Offset and target move together so wrapping never causes a jump.
      var wrapped = wrap(offset);
      target += wrapped - offset;
      offset = wrapped;
      apply();
      schedule();
    }

    function schedule() {
      if (!rafId && visible && !document.hidden) {
        rafId = window.requestAnimationFrame(frame);
      }
    }

    function restart() {
      last = performance.now();
      schedule();
    }

    showcase.addEventListener("pointerenter", function (event) {
      if (event.pointerType === "touch") return;
      hovered = true;
      target = offset;
    });

    showcase.addEventListener("pointerleave", function (event) {
      if (event.pointerType === "touch") return;
      hovered = false;
    });

    showcase.addEventListener("focusin", function () {
      focused = true;
    });

    showcase.addEventListener("focusout", function () {
      focused = false;
    });

    // Wheel up scrolls the strip the same way it drifts on its own
    // (content moving left); wheel down goes the other way.
    showcase.addEventListener(
      "wheel",
      function (event) {
        if (!hovered) return;
        event.preventDefault();
        var unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
        var dy = event.deltaY * unit;
        var dx = event.deltaX * unit;
        target += Math.abs(dx) > Math.abs(dy) ? dx : -dy;
      },
      { passive: false }
    );

    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var width = groups[0].getBoundingClientRect().width;
        if (width && width !== groupWidth) {
          var ratio = groupWidth ? width / groupWidth : 1;
          offset *= ratio;
          target *= ratio;
          groupWidth = width;
          apply();
        }
      }).observe(groups[0]);
    }

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) restart();
      }).observe(showcase);
    }

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) restart();
    });

    reduced.addEventListener("change", function () {
      if (reduced.matches) {
        showcase.classList.remove("showcase--js");
        track.style.transform = "";
        visible = false;
      }
    });

    restart();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
