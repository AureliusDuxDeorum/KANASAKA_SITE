(function () {
  "use strict";

  // Downloads page: each product's logo, drawn as traces beside it and tracked by the same HUD
  // language as the home hero (corner brackets, a short label). The traces run along the logo's
  // outline and its holes and are extruded a little, so the logo turns as a solid wire. One
  // sequence on a loop: the traces form the logo, it holds, then the same animation plays
  // backwards until nothing is left, and it starts again.
  //   data-wire="ks-c" | "ks-link"
  //   <canvas class="product-wire" data-wire="ks-c" data-tag="//KS_C  BETA" aria-hidden="true">
  // The outlines are the brand files' own: KS_C's from KS_C1's src/lib/ksLogo.ts, KS_Link's traced
  // from its logo master and snapped to horizontal, vertical and 45 degree edges. 2D canvas, no
  // libraries. All canvases share one frame loop that runs only while one is on screen and the tab
  // is visible. With motion off each draws its finished logo once.

  var MONO = '"Share Tech Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  var root = document.documentElement;

  function motionOff() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches || root.getAttribute("data-motion") === "off";
  }

  function speed() {
    return root.getAttribute("data-motion") === "reduced" ? 0.5 : 1;
  }

  function ink() {
    return window.getComputedStyle(root).getPropertyValue("--color-text").trim() || "#dfe5eb";
  }

  function clamp01(v) {
    return Math.min(1, Math.max(0, v));
  }

  // The logos: contours in the brand files' own units, the first the outline, the rest its holes.
  var LOGOS = {
    "ks-c": [
      [[200,300],[200,900],[440,900],[562.5,777.5],[685,900],[1256,900],[1367.5,788.5],[1479,900],[2000,900],[2000,820],[1512,820],[1424,732],[1776,380],[2000,380],[2000,300],[925,300],[562.5,662.5],[500,600],[800,300],[685,300],[280,705],[280,300]],
      [[280,820],[405,820],[505.5,719.5],[443,657]],
      [[619.5,719.5],[800,539],[800,643.5],[1223,643.5],[1311.25,731.75],[1223,820],[720,820]],
      [[880,563.5],[880,460],[960,380],[1662.5,380],[1367.5,675],[1256,563.5]],
    ],
    "ks-link": [
      [[181,720],[247,720],[247,1051],[578,720],[671,720],[427,965],[477,1016],[774,720],[1463,720],[1463,1145],[1751,1145],[1751,1211],[1212,1211],[1138,1137],[1064,1211],[578,1211],[477,1110],[378,1211],[181,1211]],
      [[247,1145],[379,1013],[430,1064],[348,1145]],
      [[524,1064],[672,916],[672,1001],[1002,1001],[1090,1090],[1036,1145],[607,1145]],
      [[737,851],[802,786],[1260,786],[1260,920],[1138,1043],[1031,936],[737,936]],
      [[1185,1090],[1325,948],[1325,786],[1398,786],[1398,1145],[1241,1145]],
    ],
  };
  var WIDTH = 15; // a logo is this many grid units wide
  var DEPTH = 0.3; // half the extrusion, in grid units

  // An edge is { p: [x0, y0, z0, x1, y1, z1], s, d, o }: it grows from its first end between second
  // s and s + d, and when o is set it is taken back the same way, tip first, from second o to o + d.
  function edge(list, p, s, d) {
    list.push({ p: p, s: s, d: d, o: -1 });
  }

  // a closed contour drawn as one trace: its edges one after another across [s, s + d]
  function trace(list, pts, z, s, d) {
    var lens = pts.map(function (a, i) {
      var b = pts[(i + 1) % pts.length];
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    });
    var total = lens.reduce(function (sum, v) { return sum + v; }, 0);
    var at = 0;
    pts.forEach(function (a, i) {
      var b = pts[(i + 1) % pts.length];
      var dur = (d * lens[i]) / total;
      edge(list, [a[0], a[1], z, b[0], b[1], z], s + at, dur);
      at += dur;
    });
  }

  function logo(name) {
    var contours = LOGOS[name];
    var minX = Infinity;
    var maxX = -Infinity;
    contours[0].forEach(function (q) {
      minX = Math.min(minX, q[0]);
      maxX = Math.max(maxX, q[0]);
    });
    var k = WIDTH / (maxX - minX);
    var sized = contours.map(function (c) {
      return c.map(function (q) {
        return [(q[0] - minX) * k, (q[1] - 0) * k];
      });
    });
    var perimeter = function (c) {
      return c.reduce(function (sum, a, i) {
        var b = c[(i + 1) % c.length];
        return sum + Math.hypot(b[0] - a[0], b[1] - a[1]);
      }, 0);
    };
    var longest = perimeter(sized[0]);
    var list = [];
    sized.forEach(function (c, i) {
      var s = i * 0.3;
      var d = 1.2 + 1.4 * (perimeter(c) / longest);
      trace(list, c, DEPTH, s, d);
      trace(list, c, -DEPTH, s + 0.5, d);
    });
    var corners = 0;
    sized.forEach(function (c) {
      c.forEach(function (q, i) {
        edge(list, [q[0], q[1], DEPTH, q[0], q[1], -DEPTH], 3.2 + (corners % 12) * 0.05 + i * 0.01, 0.35);
        corners += 1;
      });
    });
    var built = 0;
    list.forEach(function (e) {
      built = Math.max(built, e.s + e.d);
    });
    var holdEnd = built + 1.6;
    list.forEach(function (e) {
      e.o = holdEnd + (built - (e.s + e.d));
    });
    return { edges: list, still: built + 0.4, loop: holdEnd + built + 0.9 };
  }

  function bounds(edges) {
    var l = Infinity;
    var r = -Infinity;
    var t = Infinity;
    var b = -Infinity;
    edges.forEach(function (e) {
      l = Math.min(l, e.p[0], e.p[3]);
      r = Math.max(r, e.p[0], e.p[3]);
      t = Math.min(t, e.p[1], e.p[4]);
      b = Math.max(b, e.p[1], e.p[4]);
    });
    return { mx: (l + r) / 2, my: (t + b) / 2, width: r - l, height: b - t };
  }

  function mount(canvas) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;
    var shape = logo(canvas.getAttribute("data-wire") === "ks-link" ? "ks-link" : "ks-c");
    var tag = canvas.getAttribute("data-tag") || "";
    var box = bounds(shape.edges);
    shape.edges.forEach(function (e) {
      e.p[0] -= box.mx; e.p[3] -= box.mx; e.p[1] -= box.my; e.p[4] -= box.my;
    });
    shape.centre = box;
    var host = canvas.parentElement || canvas;
    var self = { width: 0, height: 0, onScreen: true, color: ink(), clock: 0 };

    function resize() {
      var rect = host.getBoundingClientRect();
      self.width = Math.max(1, Math.round(rect.width));
      self.height = Math.max(1, Math.round(rect.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(self.width * dpr);
      canvas.height = Math.round(self.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      self.draw();
    }

    self.draw = function () {
      var still = motionOff();
      var t = still ? shape.still : self.clock % shape.loop;
      var yaw = still ? 0.35 : Math.sin(self.clock * 0.45) * 0.4;
      var pitch = still ? 0.16 : Math.sin(self.clock * 0.3) * 0.14 + 0.1;
      var cy = Math.cos(yaw);
      var sy = Math.sin(yaw);
      var cp = Math.cos(pitch);
      var sp = Math.sin(pitch);
      var unit = Math.min((self.width * 0.72) / box.width, (self.height * 0.4) / box.height);
      var camera = Math.max(box.width, box.height) * 1.6;
      var cx = self.width / 2;
      var cyy = self.height * 0.46;
      var half = Math.max(box.width, box.height) / 2;
      var hud = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };

      function project(x, y, z) {
        var x1 = x * cy + z * sy;
        var z1 = -x * sy + z * cy;
        var y1 = y * cp - z1 * sp;
        var z2 = y * sp + z1 * cp;
        var k = camera / (camera - z2);
        return [cx + x1 * unit * k, cyy + y1 * unit * k, z2 / half];
      }

      // the brackets hug the finished object, so they do not jump as it builds
      shape.edges.forEach(function (e) {
        for (var end = 0; end < 2; end += 1) {
          var q = project(e.p[end * 3], e.p[end * 3 + 1], e.p[end * 3 + 2]);
          hud.l = Math.min(hud.l, q[0]);
          hud.r = Math.max(hud.r, q[0]);
          hud.t = Math.min(hud.t, q[1]);
          hud.b = Math.max(hud.b, q[1]);
        }
      });

      ctx.clearRect(0, 0, self.width, self.height);
      ctx.strokeStyle = self.color;
      ctx.fillStyle = self.color;
      ctx.lineCap = "round";

      var buckets = [[], [], []]; // far, middle, near
      function place(e, from, frac) {
        var p = e.p;
        var a = project(p[0] + (p[3] - p[0]) * from, p[1] + (p[4] - p[1]) * from, p[2] + (p[5] - p[2]) * from);
        var b = project(p[0] + (p[3] - p[0]) * frac, p[1] + (p[4] - p[1]) * frac, p[2] + (p[5] - p[2]) * frac);
        var depth = (a[2] + b[2]) / 2;
        var level = depth < -0.3 ? 0 : depth < 0.25 ? 1 : 2;
        buckets[level].push([a[0], a[1], b[0], b[1]]);
      }

      shape.edges.forEach(function (e) {
        var frac = still ? 1 : clamp01((t - e.s) / e.d);
        if (!still && e.o >= 0 && t >= e.o) frac = 1 - clamp01((t - e.o) / e.d);
        if (frac <= 0) return;
        place(e, 0, frac);
      });

      [[0.3, 1], [0.6, 1], [0.95, 1]].forEach(function (style, level) {
        if (!buckets[level].length) return;
        ctx.globalAlpha = style[0];
        ctx.lineWidth = style[1];
        ctx.beginPath();
        buckets[level].forEach(function (s) {
          ctx.moveTo(s[0], s[1]);
          ctx.lineTo(s[2], s[3]);
        });
        ctx.stroke();
      });

      var pad = 16;
      var l = hud.l - pad;
      var r = hud.r + pad;
      var tp = hud.t - pad;
      var bt = hud.b + pad;
      var arm = Math.max(8, Math.min(18, (r - l) * 0.08));
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7 * (still ? 1 : clamp01(t / 0.8));
      ctx.beginPath();
      ctx.moveTo(l, tp + arm); ctx.lineTo(l, tp); ctx.lineTo(l + arm, tp);
      ctx.moveTo(r - arm, tp); ctx.lineTo(r, tp); ctx.lineTo(r, tp + arm);
      ctx.moveTo(l, bt - arm); ctx.lineTo(l, bt); ctx.lineTo(l + arm, bt);
      ctx.moveTo(r - arm, bt); ctx.lineTo(r, bt); ctx.lineTo(r, bt - arm);
      ctx.stroke();
      ctx.font = "400 12px " + MONO;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.globalAlpha = 0.6;
      if (tag) ctx.fillText(tag, l, bt + 10);
      ctx.globalAlpha = 1;
    };

    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(host);
    else window.addEventListener("resize", resize);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          self.onScreen = entries[entries.length - 1].isIntersecting;
          if (self.onScreen) self.clock = 0; // each time it scrolls into view the sequence starts over
          sync();
        },
        { threshold: 0.35 }
      ).observe(host);
    }
    resize();
    return self;
  }

  var items = [];
  var running = false;
  var last = 0;

  function frame(now) {
    if (!running) return;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    items.forEach(function (item) {
      if (!item.onScreen) return;
      item.clock += dt * speed();
      item.draw();
    });
    window.requestAnimationFrame(frame);
  }

  function sync() {
    var should = !document.hidden && !motionOff() && items.some(function (item) { return item.onScreen; });
    if (should && !running) {
      running = true;
      last = 0;
      window.requestAnimationFrame(frame);
    } else if (!should) {
      running = false;
    }
  }

  function init() {
    document.querySelectorAll("canvas.product-wire").forEach(function (canvas) {
      var item = mount(canvas);
      if (item) items.push(item);
    });
    if (!items.length) return;
    if (document.fonts && document.fonts.load) {
      document.fonts.load('400 12px "Share Tech Mono"').then(function () {
        items.forEach(function (item) { item.draw(); });
      }).catch(function () {});
    }
    document.addEventListener("visibilitychange", sync);
    new MutationObserver(function () {
      items.forEach(function (item) { item.color = ink(); item.draw(); });
    }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    if (window.KanasakaMotion) {
      window.KanasakaMotion.onChange(function () {
        sync();
        items.forEach(function (item) { item.draw(); });
      });
    }
    sync();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
