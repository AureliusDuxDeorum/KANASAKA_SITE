(function () {
  "use strict";

  // KANASAKA motion layer (see docs/DESIGN.md > Motion).
  //
  // Everything animated on the site is gated here, in one place:
  //
  //   html[data-motion]  full | reduced | off      (what the person/device allows)
  //   html[data-fx]      0 | 1 | 2                 (how much cyber: theme-scaled)
  //
  //   motion  OS "reduce motion" => off, always. Otherwise the saved choice
  //           (Account > Customization, or the console): auto | full | reduced | off.
  //           "auto" = full, except when the device asks to save data => reduced.
  //           (Core count / memory are deliberately not used: tablets and phones
  //           report small numbers while being plenty fast, and everything here
  //           is compositor-only. Anyone can still pick Reduced themselves.)
  //   fx      1 = every animation (Dark and Light), 2 = the same plus the glitch
  //           effects (Accent only); reduced and off force 0.
  //
  // CSS reads those two attributes; with motion "off" the page is completely
  // static and nothing here runs. JS effects share one rAF loop (raf()) and
  // never run while the tab is hidden.

  var PREF_KEY = "kanasaka-motion";
  var PREFS = ["auto", "full", "reduced", "off"];
  var root = document.documentElement;
  var listeners = [];
  var state = { motion: "full", fx: 1 };

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // storage blocked: the choice just does not persist
    }
  }

  function getPref() {
    var pref = safeGet(PREF_KEY);
    return PREFS.indexOf(pref) === -1 ? "auto" : pref;
  }

  function osReduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function saveData() {
    var connection = navigator.connection;
    return Boolean(connection && connection.saveData);
  }

  function themeFx() {
    var theme = root.getAttribute("data-theme");
    return theme === "accent" ? 2 : 1;
  }

  function compute() {
    var pref = getPref();
    var motion;
    if (osReduced()) motion = "off";
    else if (pref === "auto") motion = saveData() ? "reduced" : "full";
    else motion = pref;

    var fx = motion === "full" ? themeFx() : 0;
    return { motion: motion, fx: fx };
  }

  function apply() {
    var next = compute();
    var changed = next.motion !== state.motion || next.fx !== state.fx;
    state = next;
    root.setAttribute("data-motion", state.motion);
    root.setAttribute("data-fx", String(state.fx));
    if (changed) {
      listeners.slice().forEach(function (cb) {
        try {
          cb(state);
        } catch (e) {
          // a broken listener must not break the others
        }
      });
    }
  }

  // ── shared rAF loop ────────────────────────────────────────────────────
  var tasks = [];
  var rafId = 0;

  function tick(now) {
    rafId = 0;
    var keep = [];
    for (var i = 0; i < tasks.length; i++) {
      var more = false;
      try {
        more = tasks[i](now);
      } catch (e) {
        more = false;
      }
      if (more) keep.push(tasks[i]);
    }
    tasks = keep;
    if (tasks.length && !document.hidden) rafId = window.requestAnimationFrame(tick);
  }

  // cb(now) returns true to be called again next frame
  function raf(cb) {
    tasks.push(cb);
    if (!rafId && !document.hidden) rafId = window.requestAnimationFrame(tick);
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && tasks.length && !rafId) rafId = window.requestAnimationFrame(tick);
  });

  // ── decode: hex scramble that resolves into the real text ───────────────
  var GLYPHS = "0123456789ABCDEF";
  var DECODE_MS = 720;
  // The site's text/ASCII effects step on one fixed tick (about 15 Hz); the hero
  // field (hero-ascii.js) reads this value too. Everything else on the page is
  // compositor-driven and runs at the display rate.
  var TICK_MS = 66;

  function decode(el, force, lockWidth) {
    if (!el || (el.hasAttribute("data-decoded") && !force) || el.children.length) return;
    var text = el.textContent;
    if (!text || !text.trim()) return;
    el.setAttribute("data-decoded", "");

    // keep the box stable while the glyphs change width
    var rect = el.getBoundingClientRect();
    el.style.minHeight = rect.height + "px";
    if (lockWidth) {
      // e.g. product names inside the moving strip: the strip must not change width
      el.style.width = rect.width + "px";
      el.style.overflow = "hidden";
    }

    // real text stays in the DOM for assistive tech; the animation is aria-hidden
    var real = document.createElement("span");
    real.className = "visually-hidden";
    real.textContent = text;
    var shown = document.createElement("span");
    shown.setAttribute("aria-hidden", "true");
    el.textContent = "";
    el.appendChild(real);
    el.appendChild(shown);

    var length = text.length;
    var lock = [];
    for (var i = 0; i < length; i++) lock.push(0.15 + (i / length) * 0.65 + Math.random() * 0.2);
    var start = performance.now();
    var lastStep = -1e9;

    raf(function (now) {
      var t = (now - start) / DECODE_MS;
      if (t >= 1) {
        el.textContent = text;
        el.style.minHeight = "";
        if (lockWidth) {
          el.style.width = "";
          el.style.overflow = "";
        }
        return false;
      }
      if (now - lastStep < TICK_MS - 4) return true;
      lastStep = now;
      var out = "";
      for (var j = 0; j < length; j++) {
        var ch = text.charAt(j);
        out += ch === " " || t >= lock[j] ? ch : GLYPHS.charAt((Math.random() * GLYPHS.length) | 0);
      }
      shown.textContent = out;
      return true;
    });
  }

  // ── reveal choreography ────────────────────────────────────────────────
  // Sections draw their top hairline; the items inside fade/rise in a short
  // stagger. Content already in view at load is revealed immediately (no
  // hide-then-show flash); the rest on scroll. No IntersectionObserver => no
  // hiding at all.
  var SECTION_SEL = "main .section, main .page-section";
  var ITEM_SEL = [
    ".page-header .breadcrumb",
    ".page-header h1",
    ".page-header .page-lead",
    ".page-header .page-actions",
    ".section-header",
    ".feature",
    ".card",
    ".cta-band",
    ".callout",
    ".spec-list",
    ".data-table tbody tr",
    ".prose > *",
    ".statement",
    ".statement-note",
  ].join(", ");
  var DECODE_SEL = ".page-header h1, .statement, .section-header h2, .cta-band h2, .feature h3, .callout h3";

  var revealIo = null;
  var mounted = false;

  function reveal(el) {
    el.classList.add("is-in");
    if (state.motion !== "full" || state.fx < 1) return;

    var targets = [];
    if (el.matches(DECODE_SEL)) targets.push(el);
    if (el.matches(".section-header, .cta-band")) {
      var heading = el.querySelector("h2");
      if (heading) targets.push(heading);
    }
    if (el.matches(".callout")) {
      var small = el.querySelector("h3");
      if (small) targets.push(small);
    }
    targets.forEach(function (target) {
      decode(target);
      watchHeading(target);
    });
  }

  // Accent only: hovering a decoded heading briefly re-scrambles it.
  function watchHeading(el) {
    if (el.hasAttribute("data-watch")) return;
    el.setAttribute("data-watch", "");
    el.addEventListener("pointerenter", function () {
      if (state.fx >= 2 && state.motion === "full" && !el.querySelector("[aria-hidden]")) {
        decode(el, true);
      }
    });
  }

  function mountReveal() {
    if (mounted || state.motion === "off") return;
    mounted = true;

    var nodes = Array.prototype.slice.call(document.querySelectorAll(SECTION_SEL + ", " + ITEM_SEL));
    var vh = window.innerHeight || 800;
    var counters = new Map();

    nodes.forEach(function (node) {
      var parent = node.parentElement;
      var index = counters.get(parent) || 0;
      counters.set(parent, index + 1);
      node.setAttribute("data-reveal", "");
      node.style.setProperty("--i", String(Math.min(index, 6)));
    });

    if (!("IntersectionObserver" in window)) {
      nodes.forEach(function (n) {
        n.classList.add("is-in");
      });
      return;
    }

    revealIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            reveal(entry.target);
            revealIo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    nodes.forEach(function (node) {
      var r = node.getBoundingClientRect();
      if (r.top < vh * 0.92) reveal(node);
      else revealIo.observe(node);
    });

    root.classList.add("fx-ready");
  }

  // ── nav indicator: one underline that slides between the top-level links ──
  function mountNavIndicator() {
    var nav = document.querySelector(".site-nav");
    if (!nav || nav.querySelector(".nav-indicator") || state.motion === "off") return;

    var indicator = document.createElement("span");
    indicator.className = "nav-indicator";
    indicator.setAttribute("aria-hidden", "true");
    nav.appendChild(indicator);
    nav.classList.add("has-indicator");

    function links() {
      return nav.querySelectorAll(":scope > .nav-item > .nav-link");
    }

    function place(link) {
      if (!link || window.innerWidth <= 1100) {
        indicator.classList.remove("is-on");
        return;
      }
      var navRect = nav.getBoundingClientRect();
      var rect = link.getBoundingClientRect();
      var padding = 14; // .nav-link horizontal padding: underline spans the word
      indicator.style.setProperty("--x", rect.left - navRect.left + padding + "px");
      indicator.style.setProperty("--w", String(Math.max(1, rect.width - padding * 2)));
      indicator.classList.add("is-on");
    }

    function home() {
      place(nav.querySelector(":scope > .nav-item > .nav-link.active"));
    }

    links().forEach(function (link) {
      link.addEventListener("pointerenter", function () {
        place(link);
      });
      link.addEventListener("focus", function () {
        place(link);
      });
    });
    nav.addEventListener("pointerleave", home);
    nav.addEventListener("focusout", function () {
      window.setTimeout(function () {
        if (!nav.contains(document.activeElement)) home();
      }, 0);
    });
    window.addEventListener("resize", home);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(home);
    home();

  }

  // ── scroll progress hairline (CSS scroll-driven animation, no JS per frame) ──
  function mountScrollProgress() {
    if (document.querySelector(".scroll-progress") || state.motion === "off") return;
    var bar = document.createElement("div");
    bar.className = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
  }

  // ── theme / state changes with a short wipe (View Transitions where available) ──
  function transition(change) {
    if (
      state.motion === "full" &&
      state.fx >= 1 &&
      typeof document.startViewTransition === "function"
    ) {
      root.classList.add("vt-wipe");
      var vt = document.startViewTransition(function () {
        change();
      });
      var done = function () {
        root.classList.remove("vt-wipe");
      };
      vt.finished.then(done, done);
      return;
    }
    change();
  }

  // ── glitch (Accent only) ────────────────────────────────────────────────
  // A short class toggle that CSS turns into a 2-step horizontal tear. Rate
  // limited per element (never more than ~2 flashes/s) and a no-op anywhere but
  // fx 2.
  var lastGlitch = new WeakMap();

  function isGlitchy() {
    return state.motion === "full" && state.fx >= 2;
  }

  function glitch(el, ms) {
    if (!el || !isGlitchy()) return;
    var now = performance.now();
    if (now - (lastGlitch.get(el) || -1e9) < 500) return;
    lastGlitch.set(el, now);
    el.classList.add("is-glitch");
    window.setTimeout(function () {
      el.classList.remove("is-glitch");
    }, ms || 140);
  }

  // ── atmosphere: scan sweep, pointer light, product-strip hover ─────────────
  var atmosphereMounted = false;

  function mountAtmosphere() {
    if (atmosphereMounted || state.motion === "off") return;
    atmosphereMounted = true;

    // scan sweep on content pages (the home page already runs the ASCII hero + grid floor)
    if (!document.getElementById("hero-ascii") && !document.querySelector(".scan-sweep")) {
      var sweep = document.createElement("div");
      sweep.className = "scan-sweep";
      sweep.setAttribute("aria-hidden", "true");
      document.body.appendChild(sweep);
    }

    // pointer light: only the element under a fine pointer is updated, once per frame
    if (window.matchMedia("(pointer: fine)").matches) {
      var LIGHT_SEL = ".card:not(.card--chamfer), .cta-band, .callout, .feature";
      document.querySelectorAll(LIGHT_SEL).forEach(function (el) {
        el.classList.add("pl-on");
      });

      var current = null;
      var px = 0;
      var py = 0;
      var queued = false;

      function update() {
        queued = false;
        if (!current) return;
        var rect = current.getBoundingClientRect();
        current.style.setProperty("--mx", px - rect.left + "px");
        current.style.setProperty("--my", py - rect.top + "px");
      }

      document.addEventListener(
        "pointermove",
        function (event) {
          if (state.motion !== "full" || event.pointerType !== "mouse") return;
          var target = event.target.closest ? event.target.closest(".pl-on") : null;
          if (target !== current) {
            if (current) current.classList.remove("is-lit");
            current = target;
            if (current) current.classList.add("is-lit");
          }
          if (!current) return;
          px = event.clientX;
          py = event.clientY;
          if (!queued) {
            queued = true;
            window.requestAnimationFrame(update);
          }
        },
        { passive: true }
      );

      document.addEventListener("pointerleave", function () {
        if (current) current.classList.remove("is-lit");
        current = null;
      });
    }

    // touch: a press lights the spot where the finger lands, then it fades
    document.addEventListener(
      "pointerdown",
      function (event) {
        if (state.motion !== "full" || event.pointerType !== "touch") return;
        var target = event.target.closest ? event.target.closest(".card, .cta-band, .callout, .feature") : null;
        if (!target) return;
        target.classList.add("pl-on");
        var rect = target.getBoundingClientRect();
        target.style.setProperty("--mx", event.clientX - rect.left + "px");
        target.style.setProperty("--my", event.clientY - rect.top + "px");
        target.classList.add("is-lit");
        window.setTimeout(function () {
          target.classList.remove("is-lit");
        }, 600);
      },
      { passive: true }
    );

    // product strip: hovering a linked product decodes its name
    document.addEventListener("pointerover", function (event) {
      if (state.motion !== "full" || state.fx < 1 || event.pointerType === "touch") return;
      var hit = event.target.closest ? event.target.closest("a.showcase-hit") : null;
      if (!hit || hit.hasAttribute("data-hovered")) return;
      hit.setAttribute("data-hovered", "");
      var name = hit.querySelector(".showcase-name");
      if (name) decode(name, true, true);
      hit.addEventListener(
        "pointerleave",
        function () {
          hit.removeAttribute("data-hovered");
        },
        { once: true }
      );
    });
  }

  // ── accent glitch triggers ───────────────────────────────────────────────
  var glitchMounted = false;

  function mountGlitch() {
    if (glitchMounted) return;
    glitchMounted = true;

    // hover: buttons, nav links and the logo tear for one beat
    document.addEventListener("pointerover", function (event) {
      if (!isGlitchy() || event.pointerType === "touch") return;
      var target = event.target.closest && event.target.closest(".button, .nav-link, .site-logo");
      if (target) glitch(target, 120);
    });

    // idle: every 7-12 s one visible bracketed element flickers its ticks
    var visibleFrames = new Set();
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visibleFrames.add(entry.target);
          else visibleFrames.delete(entry.target);
        });
      });
      document.querySelectorAll(".card, .cta-band, .callout, .showcase-soon").forEach(function (el) {
        io.observe(el);
      });
    }

    (function schedule() {
      window.setTimeout(function () {
        if (isGlitchy() && !document.hidden && visibleFrames.size) {
          var list = Array.from(visibleFrames);
          glitch(list[(Math.random() * list.length) | 0], 160);
        }
        schedule();
      }, 7000 + Math.random() * 5000);
    })();
  }

  function mount() {
    mountReveal();
    mountNavIndicator();
    mountScrollProgress();
    mountAtmosphere();
    mountGlitch();
  }

  // re-evaluate when the theme (fx tier) or OS setting changes
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  var osQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (osQuery.addEventListener) osQuery.addEventListener("change", apply);

  apply();

  window.KanasakaMotion = {
    level: function () {
      return { motion: state.motion, fx: state.fx, pref: getPref() };
    },
    getPref: getPref,
    setPref: function (pref) {
      if (PREFS.indexOf(pref) === -1) return;
      safeSet(PREF_KEY, pref);
      apply();
      if (state.motion !== "off") mount();
    },
    onChange: function (cb) {
      listeners.push(cb);
    },
    raf: raf,
    tickMs: TICK_MS,
    decode: decode,
    glitch: glitch,
    isGlitchy: isGlitchy,
    transition: transition,
    mount: mount,
    // the header was rebuilt (sign-in state): attach the nav indicator again
    remountNav: function () {
      if (mounted) mountNavIndicator();
    },
  };
})();
