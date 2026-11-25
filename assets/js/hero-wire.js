(function () {
  "use strict";

  // Home hero: slowly turning wireframe solids with a tracking HUD (bracket box, crosshair
  // lines through the centre, a short label). Painted on one 2D canvas, no libraries: the
  // geometry is a few dozen vertices, projected by hand. Colours come from CSS (--color-text),
  // so every theme works; everything that moves honours the motion setting.

  var PHI = (1 + Math.sqrt(5)) / 2;
  var MONO = 'ui-monospace, "SF Mono", "Roboto Mono", "JetBrains Mono", Consolas, monospace';
  var INTRO_MS = 1400;
  var CAMERA = 3.2; // perspective distance in object radii
  var PHONE_MAX = 700;

  // ── geometry: vertices and edges, each solid scaled to a radius of 1 ───────────────────
  function edgesByLength(v) {
    var min = Infinity;
    var i;
    var j;
    function dist(a, b) {
      var dx = a[0] - b[0];
      var dy = a[1] - b[1];
      var dz = a[2] - b[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    for (i = 0; i < v.length; i += 1) {
      for (j = i + 1; j < v.length; j += 1) min = Math.min(min, dist(v[i], v[j]));
    }
    var edges = [];
    for (i = 0; i < v.length; i += 1) {
      for (j = i + 1; j < v.length; j += 1) {
        if (dist(v[i], v[j]) < min * 1.001) edges.push([i, j]);
      }
    }
    return edges;
  }

  function solid(verts, edges) {
    var max = 0;
    verts.forEach(function (p) {
      max = Math.max(max, Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]));
    });
    return {
      v: verts.map(function (p) {
        return [p[0] / max, p[1] / max, p[2] / max];
      }),
      e: edges || edgesByLength(verts),
    };
  }

  function cube() {
    var v = [];
    [-1, 1].forEach(function (x) {
      [-1, 1].forEach(function (y) {
        [-1, 1].forEach(function (z) {
          v.push([x, y, z]);
        });
      });
    });
    return solid(v);
  }

  function octahedron() {
    return solid([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);
  }

  function tetrahedron() {
    return solid([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]);
  }

  function icosahedron() {
    var v = [];
    [-1, 1].forEach(function (a) {
      [-1, 1].forEach(function (b) {
        v.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
      });
    });
    return solid(v);
  }

  function torus() {
    var major = 12;
    var minor = 6;
    var v = [];
    var e = [];
    var i;
    var j;
    for (i = 0; i < major; i += 1) {
      for (j = 0; j < minor; j += 1) {
        var u = (i / major) * Math.PI * 2;
        var w = (j / minor) * Math.PI * 2;
        var ring = 1 + 0.38 * Math.cos(w);
        v.push([ring * Math.cos(u), 0.38 * Math.sin(w), ring * Math.sin(u)]);
        e.push([i * minor + j, i * minor + ((j + 1) % minor)]);
        e.push([i * minor + j, ((i + 1) % major) * minor + j]);
      }
    }
    return solid(v, e);
  }

  // x, y: position (-1..1 of the half width / height), size: radius as a fraction of the
  // smaller side, z: depth for parallax (0 near .. 1 far), spin: radians per second.
  // phone: a different x / y / size on narrow screens; a solid without it is left out there.
  var SPECS = [
    { id: "01", name: "ICOSA", make: icosahedron, x: 0, y: -0.04, size: 0.28, z: 0, spin: [0.16, 0.27, 0.04], phone: { x: 0, y: -0.06, size: 0.4 } },
    { id: "02", name: "TORUS", make: torus, x: -0.64, y: 0.3, size: 0.14, z: 0.45, spin: [0.3, 0.12, 0.18], phone: { x: -0.55, y: 0.66, size: 0.13 } },
    { id: "03", name: "CUBE", make: cube, x: 0.66, y: -0.38, size: 0.105, z: 0.8, spin: [0.34, 0.21, 0.1], phone: { x: 0.6, y: -0.74, size: 0.1 } },
    { id: "04", name: "OCTA", make: octahedron, x: 0.56, y: 0.4, size: 0.085, z: 0.6, spin: [0.22, 0.4, 0.06], wide: true },
    { id: "05", name: "TETRA", make: tetrahedron, x: -0.58, y: -0.4, size: 0.075, z: 0.9, spin: [0.28, 0.18, 0.24], wide: true },
  ];

  function rotate(p, ax, ay, az) {
    var x = p[0];
    var y = p[1];
    var z = p[2];
    var c = Math.cos(ax);
    var s = Math.sin(ax);
    var t = y * c - z * s;
    z = y * s + z * c;
    y = t;
    c = Math.cos(ay);
    s = Math.sin(ay);
    t = x * c + z * s;
    z = -x * s + z * c;
    x = t;
    c = Math.cos(az);
    s = Math.sin(az);
    t = x * c - y * s;
    y = x * s + y * c;
    x = t;
    return [x, y, z];
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  }

  function init() {
    var hero = document.getElementById("hero-wire");
    var canvas = document.getElementById("hw-canvas");
    var hud = document.getElementById("hw-hud");
    if (!hero || !canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var root = document.documentElement;
    var dpr = 1;
    var width = 0;
    var height = 0;
    var ink = "#dfe5eb";
    var objects = [];
    var pointer = null;
    var running = false;
    var rafId = 0;
    var tabVisible = !document.hidden;
    var onScreen = true;
    var elapsed = 0; // wall time since the page showed the hero: drives the lock-on intro
    var clock = 0; // motion time: runs slower under "reduced"
    var last = 0;
    var motionOff = reducedMotion();

    function reducedMotion() {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches || root.getAttribute("data-motion") === "off";
    }

    function speed() {
      if (motionOff) return 0;
      return root.getAttribute("data-motion") === "reduced" ? 0.5 : 1;
    }

    function readInk() {
      var value = window.getComputedStyle(root).getPropertyValue("--color-text").trim();
      if (value) ink = value;
    }

    function build() {
      var compact = width < PHONE_MAX;
      objects = SPECS.filter(function (spec) {
        return !compact || spec.phone;
      }).map(function (spec, index) {
        var shape = spec.make();
        return {
          spec: spec,
          v: shape.v,
          e: shape.e,
          seed: index * 1.7,
          pts: new Array(shape.v.length),
          cx: 0,
          cy: 0,
          box: null,
          ry: 0,
        };
      });
    }

    function resize() {
      var rect = hero.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (!running) render(clock);
    }

    function place(obj, t, intro) {
      var compact = width < PHONE_MAX;
      var spec = compact ? Object.assign({}, obj.spec, obj.spec.phone) : obj.spec;
      var base = Math.min(width, height);
      var radius = spec.size * base;
      var drift = speed() ? Math.sin(t * 0.35 + obj.seed) * 0.012 : 0;
      var px = pointer ? (pointer.x / width - 0.5) * (1 - spec.z) * -18 : 0;
      var py = pointer ? (pointer.y / height - 0.5) * (1 - spec.z) * -18 : 0;
      var cx = width / 2 + spec.x * (width / 2) + px;
      var cy = height * 0.47 + (spec.y + drift) * height * 0.5 + py;
      var ax = obj.seed + t * spec.spin[0];
      var ay = obj.seed * 0.6 + t * spec.spin[1];
      var az = t * spec.spin[2];
      var minX = Infinity;
      var maxX = -Infinity;
      var minY = Infinity;
      var maxY = -Infinity;
      var grow = 0.55 + 0.45 * easeOut(intro);

      obj.v.forEach(function (point, i) {
        var r = rotate(point, ax, ay, az);
        var k = CAMERA / (CAMERA - r[2] * 0.6);
        var x = cx + r[0] * radius * k * grow;
        var y = cy + r[1] * radius * k * grow;
        obj.pts[i] = [x, y, r[2]];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });

      obj.cx = cx;
      obj.cy = cy;
      obj.box = { l: minX, r: maxX, t: minY, b: maxY };
      obj.ry = ((ay * 180) / Math.PI) % 360;
      obj.radius = radius;
    }

    function drawEdges(obj, alpha) {
      // three depth buckets keep it to three strokes per solid
      var buckets = [[], [], []];
      obj.e.forEach(function (edge) {
        var a = obj.pts[edge[0]];
        var b = obj.pts[edge[1]];
        var depth = (a[2] + b[2]) / 2;
        buckets[depth < -0.35 ? 0 : depth < 0.3 ? 1 : 2].push(a, b);
      });
      var levels = [0.22, 0.5, 0.9];
      ctx.lineWidth = 1;
      buckets.forEach(function (list, index) {
        if (!list.length) return;
        ctx.globalAlpha = levels[index] * alpha;
        ctx.beginPath();
        for (var i = 0; i < list.length; i += 2) {
          ctx.moveTo(list[i][0], list[i][1]);
          ctx.lineTo(list[i + 1][0], list[i + 1][1]);
        }
        ctx.stroke();
      });
    }

    function drawNodes(obj, alpha) {
      if (obj.radius < 36 || obj.v.length > 20) return;
      obj.pts.forEach(function (p) {
        ctx.globalAlpha = (0.25 + 0.6 * ((p[2] + 1) / 2)) * alpha;
        ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
      });
    }

    function drawTracking(obj, hot, intro) {
      var box = obj.box;
      var pad = 12 + (1 - easeOut(intro)) * 70;
      var l = box.l - pad;
      var r = box.r + pad;
      var t = box.t - pad;
      var b = box.b + pad;
      var arm = Math.max(8, Math.min(20, (r - l) * 0.22));
      var strong = hot ? 1 : 0.55;

      // crosshair lines through the centre, broken around the bracket
      ctx.save();
      ctx.setLineDash([2, 5]);
      ctx.globalAlpha = (hot ? 0.34 : 0.13) * easeOut(intro);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, obj.cy);
      ctx.lineTo(l - 8, obj.cy);
      ctx.moveTo(r + 8, obj.cy);
      ctx.lineTo(width, obj.cy);
      ctx.moveTo(obj.cx, 0);
      ctx.lineTo(obj.cx, t - 8);
      ctx.moveTo(obj.cx, b + 8);
      ctx.lineTo(obj.cx, height);
      ctx.stroke();
      ctx.restore();

      // corner brackets
      ctx.globalAlpha = strong * easeOut(intro);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(l, t + arm); ctx.lineTo(l, t); ctx.lineTo(l + arm, t);
      ctx.moveTo(r - arm, t); ctx.lineTo(r, t); ctx.lineTo(r, t + arm);
      ctx.moveTo(l, b - arm); ctx.lineTo(l, b); ctx.lineTo(l + arm, b);
      ctx.moveTo(r - arm, b); ctx.lineTo(r, b); ctx.lineTo(r, b - arm);
      // centre mark
      ctx.moveTo(obj.cx - 4, obj.cy); ctx.lineTo(obj.cx + 4, obj.cy);
      ctx.moveTo(obj.cx, obj.cy - 4); ctx.lineTo(obj.cx, obj.cy + 4);
      ctx.stroke();

      // label, beside the bracket (on the left when there is no room on the right)
      var small = obj.radius < 40;
      var rows = ["//OBJ_" + obj.spec.id + " " + obj.spec.name];
      if (!small) {
        rows.push("V" + obj.v.length + " E" + obj.e.length);
        rows.push("RY " + (obj.ry < 0 ? obj.ry + 360 : obj.ry).toFixed(1).padStart(5, "0"));
      }
      if (hot && !small) {
        rows.push("X " + ((obj.cx / width) * 2 - 1).toFixed(2) + " Y " + ((obj.cy / height) * 2 - 1).toFixed(2));
      }
      // beside the bracket on wide screens (outward from the middle); centred under it on phones
      var under = width < PHONE_MAX;
      var flip = obj.cx < width * 0.42 || r + 150 > width;
      ctx.font = "600 11px " + MONO;
      ctx.textBaseline = "top";
      ctx.textAlign = under ? "center" : flip ? "right" : "left";
      var tx = under ? obj.cx : flip ? l - 10 : r + 10;
      var ty = under ? b + 8 : t;
      rows.forEach(function (text, i) {
        ctx.globalAlpha = (i === 0 ? 0.92 : 0.55) * strong * easeOut(intro) * (hot || i === 0 ? 1 : 0.8);
        ctx.fillText(text, tx, ty + i * 14);
      });
    }

    function introNow() {
      return motionOff ? 1 : Math.min(1, elapsed / (INTRO_MS / 1000));
    }

    function render(t) {
      var intro = introNow();
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;

      var hotIndex = -1;
      if (pointer) {
        var best = Math.min(width, height) * 0.24;
        objects.forEach(function (obj, i) {
          var d = Math.hypot(pointer.x - obj.cx, pointer.y - obj.cy);
          if (d < best + obj.radius * 0.4) {
            best = d;
            hotIndex = i;
          }
        });
      }

      objects.forEach(function (obj) {
        place(obj, t, intro);
      });
      objects.forEach(function (obj, i) {
        var hot = i === hotIndex;
        drawEdges(obj, hot ? 1 : 0.85);
        drawNodes(obj, hot ? 1 : 0.8);
        drawTracking(obj, hot, intro);
      });

      // top-left: how many objects are tracked
      ctx.font = "600 11px " + MONO;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.globalAlpha = 0.5 * easeOut(intro);
      ctx.fillText("//TRACK " + String(objects.length).padStart(2, "0") + " OBJ", Math.max(20, width * 0.04), 24);
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (!running) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      elapsed += dt;
      clock += dt * speed();
      render(clock);
      rafId = window.requestAnimationFrame(frame);
    }

    function sync() {
      var should = tabVisible && onScreen && !motionOff;
      if (should && !running) {
        running = true;
        last = 0;
        rafId = window.requestAnimationFrame(frame);
      } else if (!should && running) {
        running = false;
        if (rafId) window.cancelAnimationFrame(rafId);
      }
    }

    function setHud() {
      if (!hud) return;
      var meta = window.KanasakaMeta;
      hud.textContent = "//KS_SYS  " + (meta && meta.version ? "V" + meta.version : "ONLINE");
    }

    readInk();
    resize();
    setHud();
    // with motion off the single frame is already complete (introNow() is 1)
    if (motionOff) render(clock);
    sync();
    window.setTimeout(setHud, 800);

    if ("ResizeObserver" in window) {
      new ResizeObserver(resize).observe(hero);
    } else {
      window.addEventListener("resize", resize);
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          onScreen = entries[entries.length - 1].isIntersecting;
          sync();
        },
        { threshold: 0.1 }
      ).observe(hero);
    }

    document.addEventListener("visibilitychange", function () {
      tabVisible = !document.hidden;
      sync();
    });

    hero.addEventListener(
      "pointermove",
      function (event) {
        if (event.pointerType === "touch") return;
        var rect = hero.getBoundingClientRect();
        pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        if (!running) render(clock);
      },
      { passive: true }
    );
    hero.addEventListener("pointerleave", function () {
      pointer = null;
      if (!running) render(clock);
    });

    new MutationObserver(function () {
      readInk();
      if (!running) render(clock);
    }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    if (window.KanasakaMotion) {
      window.KanasakaMotion.onChange(function () {
        var off = reducedMotion();
        if (off === motionOff) return;
        motionOff = off;
        if (motionOff) {
          if (rafId) window.cancelAnimationFrame(rafId);
          running = false;
          render(clock);
        } else {
          sync();
        }
      });
    }
  }

  window.KanasakaHeroWire = { init: init };
})();
