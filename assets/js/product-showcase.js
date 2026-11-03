(function () {
  "use strict";

  // The strip's endless drift is a CSS animation (@keyframes showcase-scroll
  // in home.css), which the browser runs on the compositor thread, so it stays
  // smooth even while the main thread is busy (the ASCII hero, slow phones).
  // This script only *steers* that animation through the Web Animations API:
  //
  //   - hover / focus eases its playbackRate down to 0 and back up to 1
  //   - the mouse wheel nudges its currentTime
  //
  // and it only does per-frame work while one of those is in flight. At full
  // speed, or fully stopped, nothing runs on the main thread at all.
  //
  // Without Element.getAnimations (old browsers) the pure-CSS animation keeps
  // running and simply pauses on hover.

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
    if (typeof track.getAnimations !== "function") return;

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    var anim = track.getAnimations().filter(function (a) {
      return a.animationName === "showcase-scroll";
    })[0];
    if (!anim || !anim.effect) return;

    var loopMs = Number(anim.effect.getComputedTiming().duration);
    if (!loopMs || !isFinite(loopMs)) return;

    // from here on, JS owns hover/focus (the CSS pause-on-hover rule steps aside)
    showcase.classList.add("showcase--js");

    var groupWidth = groups[0].getBoundingClientRect().width;
    var drift = 1; // 0..1 position on the speed ramp; playbackRate = ease(drift)
    var pending = 0; // wheel distance (px) still to be applied
    var hovered = false;
    var focused = false;
    var visible = true;
    var rafId = 0;
    var last = 0;

    function ease(t) {
      return t * t * (3 - 2 * t);
    }

    function target() {
      return hovered || focused ? 0 : 1;
    }

    function settled() {
      return drift === target() && pending === 0;
    }

    // Moves the strip by `px` along its drift direction (positive = content
    // moves left, like the drift itself), wrapping inside one loop.
    function shift(px) {
      if (!groupWidth) return;
      var time = Number(anim.currentTime) || 0;
      time = (((time + (px * loopMs) / groupWidth) % loopMs) + loopMs) % loopMs;
      anim.currentTime = time;
    }

    function frame(now) {
      rafId = 0;
      var dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      if (drift !== target()) {
        drift = target()
          ? Math.min(1, drift + dt / SPEED_UP_SECONDS)
          : Math.max(0, drift - dt / SLOW_DOWN_SECONDS);
        anim.playbackRate = ease(drift);
      }

      // Wheel input is applied gradually rather than in one jump.
      if (pending) {
        var step = pending * (1 - Math.exp(-dt / WHEEL_SMOOTHING));
        pending -= step;
        if (Math.abs(pending) < 0.01) pending = 0;
        shift(step);
      }

      if (!settled()) schedule();
    }

    function schedule() {
      if (!rafId && visible && !document.hidden) {
        rafId = window.requestAnimationFrame(frame);
      }
    }

    function kick() {
      if (!rafId) last = performance.now();
      schedule();
    }

    function syncPlayState() {
      if (visible && !document.hidden) {
        anim.play();
        if (!settled()) kick();
      } else {
        anim.pause();
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      }
    }

    showcase.addEventListener("pointerenter", function (event) {
      if (event.pointerType === "touch") return;
      hovered = true;
      kick();
    });

    showcase.addEventListener("pointerleave", function (event) {
      if (event.pointerType === "touch") return;
      hovered = false;
      kick();
    });

    showcase.addEventListener("focusin", function () {
      focused = true;
      kick();
    });

    showcase.addEventListener("focusout", function () {
      focused = false;
      kick();
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
        kick();
      },
      { passive: false }
    );

    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        groupWidth = groups[0].getBoundingClientRect().width || groupWidth;
      }).observe(groups[0]);
    }

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        syncPlayState();
      }).observe(showcase);
    }

    document.addEventListener("visibilitychange", syncPlayState);

    reduced.addEventListener("change", function () {
      if (reduced.matches) {
        showcase.classList.remove("showcase--js");
        visible = false;
        syncPlayState();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
