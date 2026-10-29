(function () {
  "use strict";

  var LOOP_SECONDS = 70;
  // Seconds to get back to full drift speed after the cursor leaves, and to
  // wind down once it enters. Both are eased, so neither starts nor stops
  // abruptly.
  var SPEED_UP_SECONDS = 0.5;
  var SLOW_DOWN_SECONDS = 0.6;
  // Time constant (seconds) for the wheel's smoothing.
  var WHEEL_SMOOTHING = 0.09;

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
    var pending = 0;
    var drift = 1;
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

    function ease(t) {
      return t * t * (3 - 2 * t);
    }

    function frame(now) {
      rafId = 0;
      var dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      // drift (0..1) is how far along the speed ramp we are; the actual
      // speed is eased from it, so it never starts or stops abruptly.
      if (hovered || focused) {
        drift = Math.max(0, drift - dt / SLOW_DOWN_SECONDS);
      } else {
        drift = Math.min(1, drift + dt / SPEED_UP_SECONDS);
      }
      offset += (groupWidth / LOOP_SECONDS) * ease(drift) * dt;

      // Wheel input is applied gradually rather than in one jump.
      if (pending) {
        var step = pending * (1 - Math.exp(-dt / WHEEL_SMOOTHING));
        offset += step;
        pending -= step;
        if (Math.abs(pending) < 0.01) pending = 0;
      }

      offset = wrap(offset);
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
        pending += Math.abs(dx) > Math.abs(dy) ? dx : -dy;
      },
      { passive: false }
    );

    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var width = groups[0].getBoundingClientRect().width;
        if (width && width !== groupWidth) {
          var ratio = groupWidth ? width / groupWidth : 1;
          offset *= ratio;
          pending *= ratio;
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
