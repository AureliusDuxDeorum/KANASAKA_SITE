(function () {
  "use strict";

  // Account Settings: the account ID as an extruded wireframe in the black void on the left.
  // The letters build on one after another, then the whole word swings slowly, tracked by the
  // same HUD language as the home hero (bracket box, dashed crosshair lines through its centre,
  // a short label with live values). 2D canvas, no libraries; the letters come from wire-font.js.
  //
  //   KanasakaAccountWire.set("dev_ks")   called by auth-settings.js once the profile is loaded,
  //                                       and again after the ID is changed

  var LINE_CHARS = 12; // longer IDs wrap onto further lines
  var MONO = 'ui-monospace, "SF Mono", "Roboto Mono", "JetBrains Mono", Consolas, monospace';
  var STILL_YAW = 0.5;
  var STILL_PITCH = 0.18;

  var state = null; // set by init()
  var pending = ""; // an ID handed over before the canvas was ready

  function easeOut(t) {
    return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  }

  function chunk(id) {
    var lines = [];
    for (var i = 0; i < id.length; i += LINE_CHARS) lines.push(id.slice(i, i + LINE_CHARS));
    return lines;
  }

  // The ID as solid 3D letters: wire-font.js builds every stroke as one continuous square beam
  // (curves add no connecting lines), ordered letter by letter so the build-on reads left to right.
  function buildEdges(id) {
    var font = window.KanasakaWireFont;
    if (!font || !id) return { pts: new Float64Array(0), count: 0, width: 1, height: 1 };
    var block = font.beams(chunk(id));
    var pts = new Float64Array(block.edges.length * 6);
    block.edges.forEach(function (edge, i) {
      for (var d = 0; d < 6; d += 1) pts[i * 6 + d] = edge[d];
    });
    return { pts: pts, count: block.edges.length, width: block.width, height: block.height };
  }

  function init() {
    var canvas = document.getElementById("settings-wire");
    if (!canvas || !canvas.getContext || state) return;
    var host = canvas.parentElement || canvas;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var root = document.documentElement;
    var s = {
      id: "",
      shape: buildEdges(""),
      screen: new Float64Array(0),
      depth: new Float64Array(0),
      width: 0,
      height: 0,
      ink: "#dfe5eb",
      running: false,
      rafId: 0,
      tabVisible: !document.hidden,
      onScreen: true,
      clock: 0,
      built: 0, // seconds since the ID was set: drives the build-on
      last: 0,
      pointer: null,
      tilt: 0,
    };
    state = s;

    function motionOff() {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches || root.getAttribute("data-motion") === "off";
    }

    function speed() {
      if (motionOff()) return 0;
      return root.getAttribute("data-motion") === "reduced" ? 0.5 : 1;
    }

    function readInk() {
      var value = window.getComputedStyle(root).getPropertyValue("--color-text").trim();
      if (value) s.ink = value;
    }

    function resize() {
      var rect = host.getBoundingClientRect();
      s.width = Math.max(1, Math.round(rect.width));
      s.height = Math.max(1, Math.round(rect.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(s.width * dpr);
      canvas.height = Math.round(s.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!s.running) render();
    }

    function set(value) {
      var id = String(value || "").toLowerCase();
      if (id === s.id) return;
      s.id = id;
      s.shape = buildEdges(id);
      s.screen = new Float64Array(s.shape.count * 4);
      s.depth = new Float64Array(s.shape.count);
      s.built = 0;
      if (!s.running) render();
    }

    function revealDuration() {
      return Math.min(2.6, 0.9 + s.shape.count * 0.002);
    }

    function progress() {
      return motionOff() ? 1 : Math.min(1, s.built / revealDuration());
    }

    // Project every edge for the current pose; returns the box around what is drawn so far.
    function project(shown) {
      var shape = s.shape;
      var still = motionOff();
      var yaw = still ? STILL_YAW : Math.sin(s.clock * 0.45) * 0.85 + s.tilt;
      var pitch = still ? STILL_PITCH : Math.sin(s.clock * 0.3) * 0.2 + 0.12;
      var cy = Math.cos(yaw);
      var sy = Math.sin(yaw);
      var cp = Math.cos(pitch);
      var sp = Math.sin(pitch);
      var unit = Math.min((s.width * 0.74) / shape.width, (s.height * 0.4) / shape.height);
      var camera = Math.max(shape.width, shape.height) * 1.6;
      var cx = s.width / 2;
      var cyy = s.height * 0.46;
      var box = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };

      for (var i = 0; i < shape.count; i += 1) {
        var depthSum = 0;
        for (var end = 0; end < 2; end += 1) {
          var x = shape.pts[i * 6 + end * 3];
          var y = shape.pts[i * 6 + end * 3 + 1];
          var z = shape.pts[i * 6 + end * 3 + 2];
          var x1 = x * cy + z * sy;
          var z1 = -x * sy + z * cy;
          var y1 = y * cp - z1 * sp;
          var z2 = y * sp + z1 * cp;
          var k = camera / (camera - z2);
          var px = cx + x1 * unit * k;
          var py = cyy + y1 * unit * k;
          s.screen[i * 4 + end * 2] = px;
          s.screen[i * 4 + end * 2 + 1] = py;
          depthSum += z2;
          if (i < shown) {
            box.l = Math.min(box.l, px);
            box.r = Math.max(box.r, px);
            box.t = Math.min(box.t, py);
            box.b = Math.max(box.b, py);
          }
        }
        s.depth[i] = depthSum / 2 / (Math.max(shape.width, shape.height) / 2);
      }
      return { box: box, yaw: yaw };
    }

    function drawEdges(shown) {
      var levels = [0.3, 0.6, 0.95];
      var buckets = [[], [], []];
      var whole = Math.floor(shown);
      for (var i = 0; i < whole; i += 1) buckets[s.depth[i] < -0.3 ? 0 : s.depth[i] < 0.25 ? 1 : 2].push(i);
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      buckets.forEach(function (list, index) {
        if (!list.length) return;
        ctx.globalAlpha = levels[index];
        ctx.beginPath();
        list.forEach(function (i) {
          ctx.moveTo(s.screen[i * 4], s.screen[i * 4 + 1]);
          ctx.lineTo(s.screen[i * 4 + 2], s.screen[i * 4 + 3]);
        });
        ctx.stroke();
      });
      // the edge being drawn right now grows from its first end
      if (whole < s.shape.count) {
        var f = shown - whole;
        var x0 = s.screen[whole * 4];
        var y0 = s.screen[whole * 4 + 1];
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + (s.screen[whole * 4 + 2] - x0) * f, y0 + (s.screen[whole * 4 + 3] - y0) * f);
        ctx.stroke();
      }
    }

    function drawTracker(box, rows, intro) {
      if (!isFinite(box.l)) return;
      var pad = 16 + (1 - easeOut(intro)) * 60;
      var l = box.l - pad;
      var r = box.r + pad;
      var t = box.t - pad;
      var b = box.b + pad;
      var mx = (box.l + box.r) / 2;
      var my = (box.t + box.b) / 2;
      var arm = Math.max(8, Math.min(20, (r - l) * 0.08));
      var fade = easeOut(intro);

      ctx.save();
      ctx.setLineDash([2, 5]);
      ctx.globalAlpha = 0.16 * fade;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, my); ctx.lineTo(l - 8, my);
      ctx.moveTo(r + 8, my); ctx.lineTo(s.width, my);
      ctx.moveTo(mx, 0); ctx.lineTo(mx, t - 8);
      ctx.moveTo(mx, b + 8); ctx.lineTo(mx, s.height);
      ctx.stroke();
      ctx.restore();

      ctx.globalAlpha = 0.7 * fade;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(l, t + arm); ctx.lineTo(l, t); ctx.lineTo(l + arm, t);
      ctx.moveTo(r - arm, t); ctx.lineTo(r, t); ctx.lineTo(r, t + arm);
      ctx.moveTo(l, b - arm); ctx.lineTo(l, b); ctx.lineTo(l + arm, b);
      ctx.moveTo(r - arm, b); ctx.lineTo(r, b); ctx.lineTo(r, b - arm);
      ctx.moveTo(mx - 4, my); ctx.lineTo(mx + 4, my);
      ctx.moveTo(mx, my - 4); ctx.lineTo(mx, my + 4);
      ctx.stroke();

      ctx.font = "600 11px " + MONO;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      rows.forEach(function (text, i) {
        ctx.globalAlpha = (i === 0 ? 0.92 : 0.55) * fade;
        ctx.fillText(text, l, b + 10 + i * 14);
      });
    }

    function render() {
      ctx.clearRect(0, 0, s.width, s.height);
      ctx.strokeStyle = s.ink;
      ctx.fillStyle = s.ink;
      ctx.font = "600 11px " + MONO;
      ctx.textBaseline = "top";

      if (!s.shape.count) {
        ctx.textAlign = "center";
        ctx.globalAlpha = 0.5;
        ctx.fillText("//ACC_ID  ----", s.width / 2, s.height * 0.46);
        ctx.globalAlpha = 1;
        return;
      }

      var p = progress();
      var shown = easeOut(p) * s.shape.count;
      var pose = project(Math.ceil(shown));
      drawEdges(shown);
      var deg = ((((pose.yaw * 180) / Math.PI) % 360) + 360) % 360;
      drawTracker(
        pose.box,
        ["//ACC_ID", "LEN " + String(s.id.length).padStart(2, "0"), "RY " + deg.toFixed(1).padStart(5, "0")],
        Math.min(1, p * 1.4)
      );
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (!s.running) return;
      var dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 0;
      s.last = now;
      s.built += dt;
      s.clock += dt * speed();
      var want = s.pointer ? (s.pointer.x / s.width - 0.5) * 0.5 : 0;
      s.tilt += (want - s.tilt) * Math.min(1, dt * 4);
      render();
      s.rafId = window.requestAnimationFrame(frame);
    }

    function sync() {
      var should = s.tabVisible && s.onScreen && !motionOff();
      if (should && !s.running) {
        s.running = true;
        s.last = 0;
        s.rafId = window.requestAnimationFrame(frame);
      } else if (!should && s.running) {
        s.running = false;
        if (s.rafId) window.cancelAnimationFrame(s.rafId);
      }
    }

    s.set = set;
    readInk();
    resize();
    set(pending);
    sync();

    if ("ResizeObserver" in window) {
      new ResizeObserver(resize).observe(host);
    } else {
      window.addEventListener("resize", resize);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          s.onScreen = entries[entries.length - 1].isIntersecting;
          sync();
        },
        { threshold: 0.05 }
      ).observe(host);
    }
    document.addEventListener("visibilitychange", function () {
      s.tabVisible = !document.hidden;
      sync();
    });
    host.addEventListener(
      "pointermove",
      function (event) {
        if (event.pointerType === "touch") return;
        var rect = host.getBoundingClientRect();
        s.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      },
      { passive: true }
    );
    host.addEventListener("pointerleave", function () {
      s.pointer = null;
    });
    new MutationObserver(function () {
      readInk();
      if (!s.running) render();
    }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    if (window.KanasakaMotion) {
      window.KanasakaMotion.onChange(function () {
        sync();
        if (!s.running) render();
      });
    }
  }

  window.KanasakaAccountWire = {
    init: init,
    build: buildEdges, // exposed for the tests
    set: function (id) {
      if (state) state.set(id);
      else pending = String(id || "").toLowerCase();
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
