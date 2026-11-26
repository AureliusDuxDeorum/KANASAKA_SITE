(function () {
  "use strict";

  // Home hero: one wireframe that never stops changing form, on a 2D canvas, no libraries.
  //
  //   TESSERACT  a rotating 4D hypercube (a cube inside a cube, turning through the 4th axis)
  //   FOLD       the 4th axis collapses: the inner cube merges into the outer one
  //   RESOLVE    the cube morphs into the KANASAKA mark, extruded into a thin slab
  //   KANASAKA   the mark holds, swinging gently
  //   SPLIT      it breaks into four segments, one per product, each tracked by the HUD
  //   FUSE       the segments rejoin into the mark
  //   REFORM     the mark folds back into a cube
  //   UNFOLD     the 4th axis opens again: back to the tesseract
  //
  // Easter egg: once the session is 10 minutes old (the clock hud.js keeps in sessionStorage), the
  // next time the tesseract is due it morphs into the words "A NEW ERA OF EVOLUTION" instead,
  // holds for 10 seconds, morphs back, and the loop carries on where it was. Once per session;
  // add ?egg to the address to see it straight away.
  //
  // Every state is the same SEGMENTS line segments, matched one to one, so a transition is just
  // an interpolation of endpoints. The HUD (bracket box, dashed crosshair lines, a short label
  // with live values) follows the whole shape, then each of the four segments.
  // Colours come from CSS (--color-text); everything honours the motion setting.

  var SEGMENTS = 768; // the words as extruded outlines need about 620 of them; the tesseract is 32 edges x 24
  var CYCLE = 23; // seconds for one full loop (the mark holds for 6 of them)
  var STILL_AT = 11; // the frame shown when motion is off: the mark, held
  var INTRO_MS = 1400;
  var CAMERA = 3.2; // perspective distance in object radii
  var D4 = 2.8; // distance of the 4D eye (nearer = the inner cube reads smaller)
  var TESS_SCALE = 0.72; // the cube is drawn smaller than the mark so the two have the same presence
  var PHONE_MAX = 700;
  var MONO = '"Share Tech Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  // assets/logo/ks-horizontal.svg: one outline and two holes, straight lines only
  var LOGO_PATH =
    "M0,0 L101.6,0 L101.6,514.4 L615.98,0 L761.75,0 L380.73,380.7 L460.22,460.1 L920.35,0 L1523.6,0 L1523.6,101.8 L964.6,101.8 L863.1,203.08 L863.1,334.88 L1523.6,334.88 L1523.6,606.05 L1371.35,761.85 L615.98,761.85 L460.22,606.05 L307.35,761.85 L0,761.85 Z " +
    "M761.75,304.45 L761.75,436.43 L1421.9,436.43 L1421.9,565.2 L1326.98,660.12 L659.85,660.12 L533.25,533 Z " +
    "M307.35,453.7 L387.48,533 L260.35,660.12 L101.6,660.12 Z";
  var LOGO_WIDTH = 2.8; // in object radii (the cube is 2 wide)
  var LOGO_HALF_DEPTH = 0.1;

  var EGG_AFTER_MS = 10 * 60 * 1000;
  var EGG_IN = 1.6; // seconds to morph into the words
  var EGG_HOLD = 10;
  var EGG_OUT = 1.6;
  var EGG_TOTAL = EGG_IN + EGG_HOLD + EGG_OUT;
  var SESSION_KEY = "kanasaka-session-start"; // shared with hud.js
  var EGG_KEY = "kanasaka-egg-shown";

  // The letters come from the shared 3D font (wire-font.js), loaded just before this file.
  var PHRASE_WIDE = ["A NEW ERA", "OF EVOLUTION"];
  var PHRASE_NARROW = ["A NEW ERA", "OF", "EVOLUTION"];
  var TEXT_WIDTH_WIDE = 4.4; // in object radii
  var TEXT_WIDTH_NARROW = 3.3;

  // left to right across the mark
  var PRODUCTS = [
    { name: "KS_C", status: "BETA" },
    { name: "KS_LINK", status: "ALPHA" },
    { name: "KS_K", status: "SOON" },
    { name: "KS_UNIFY", status: "SOON" },
  ];

  // ── geometry ────────────────────────────────────────────────────────────────────────────
  function lengthOf(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += (a[i] - b[i]) * (a[i] - b[i]);
    return Math.sqrt(sum);
  }

  // Split a list of edges [a, b] into exactly `count` straight pieces, longer edges getting more.
  function subdivide(edges, count) {
    var total = 0;
    var lengths = edges.map(function (edge) {
      var len = lengthOf(edge[0], edge[1]);
      total += len;
      return len;
    });
    var spare = count - edges.length;
    var share = lengths.map(function (len) {
      return total ? (spare * len) / total : 0;
    });
    var pieces = share.map(function (s) {
      return 1 + Math.floor(s);
    });
    var left =
      count -
      pieces.reduce(function (a, b) {
        return a + b;
      }, 0);
    share
      .map(function (s, i) {
        return [s - Math.floor(s), i];
      })
      .sort(function (a, b) {
        return b[0] - a[0];
      })
      .slice(0, Math.max(0, left))
      .forEach(function (entry) {
        pieces[entry[1]] += 1;
      });

    var out = [];
    edges.forEach(function (edge, i) {
      var a = edge[0];
      var b = edge[1];
      for (var k = 0; k < pieces[i]; k += 1) {
        var t0 = k / pieces[i];
        var t1 = (k + 1) / pieces[i];
        out.push([
          a.map(function (v, d) {
            return v + (b[d] - v) * t0;
          }),
          a.map(function (v, d) {
            return v + (b[d] - v) * t1;
          }),
        ]);
      }
    });
    return out;
  }

  // Ordered so that neighbouring pieces are neighbours in space: first a closed loop through
  // all 16 corners (Gray code), then the remaining 16 edges.
  function tesseractEdges() {
    function corner(i) {
      return [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1];
    }
    var loop = [];
    var used = {};
    for (var i = 0; i < 16; i += 1) {
      var a = i ^ (i >> 1);
      var b = (i + 1 < 16 ? i + 1 : 0) ^ ((i + 1 < 16 ? i + 1 : 0) >> 1);
      loop.push([corner(a), corner(b)]);
      used[Math.min(a, b) + "-" + Math.max(a, b)] = true;
    }
    var rest = [];
    for (var x = 0; x < 16; x += 1) {
      for (var bit = 0; bit < 4; bit += 1) {
        var y = x ^ (1 << bit);
        if (x < y && !used[x + "-" + y]) rest.push([corner(x), corner(y)]);
      }
    }
    return loop.concat(rest);
  }

  function logoEdges() {
    var loops = [];
    LOGO_PATH.split("Z").forEach(function (part) {
      var nums = part.match(/-?\d+(\.\d+)?/g);
      if (!nums || nums.length < 6) return;
      var loop = [];
      for (var i = 0; i < nums.length; i += 2) loop.push([+nums[i], +nums[i + 1]]);
      loops.push(loop);
    });
    var scale = LOGO_WIDTH / 1523.6;
    var cx = 1523.6 / 2;
    var cy = 761.85 / 2;
    var edges = [];
    loops.forEach(function (loop) {
      var pts = loop.map(function (p) {
        return [(p[0] - cx) * scale, (p[1] - cy) * scale];
      });
      [LOGO_HALF_DEPTH, -LOGO_HALF_DEPTH].forEach(function (z) {
        pts.forEach(function (p, i) {
          var q = pts[(i + 1) % pts.length];
          edges.push([[p[0], p[1], z], [q[0], q[1], z]]);
        });
      });
      pts.forEach(function (p) {
        edges.push([[p[0], p[1], LOGO_HALF_DEPTH], [p[0], p[1], -LOGO_HALF_DEPTH]]);
      });
    });
    return edges;
  }

  // The phrase as solid 3D letters (extruded glyph outlines, see wire-font.js), in object units,
  // centred.
  function textEdges(lines, targetWidth) {
    var block = window.KanasakaWireFont.solid(lines);
    var scale = targetWidth / block.width;
    return block.edges.map(function (e) {
      return [
        [e[0] * scale, e[1] * scale, e[2] * scale],
        [e[3] * scale, e[4] * scale, e[5] * scale],
      ];
    });
  }

  function flat3(segs) {
    var out = new Float64Array(SEGMENTS * 6);
    segs.forEach(function (seg, j) {
      for (var d = 0; d < 3; d += 1) {
        out[j * 6 + d] = seg[0][d];
        out[j * 6 + 3 + d] = seg[1][d];
      }
    });
    return out;
  }

  function buildMorph() {
    var tess = subdivide(tesseractEdges(), SEGMENTS);
    var logo = subdivide(logoEdges(), SEGMENTS);
    var a4 = new Float64Array(SEGMENTS * 8);
    var l3 = new Float64Array(SEGMENTS * 6);
    var group = new Uint8Array(SEGMENTS);
    for (var j = 0; j < SEGMENTS; j += 1) {
      var t = tess[j];
      var l = logo[j];
      var d;
      for (d = 0; d < 4; d += 1) {
        a4[j * 8 + d] = t[0][d];
        a4[j * 8 + 4 + d] = t[1][d];
      }
      for (d = 0; d < 3; d += 1) {
        l3[j * 6 + d] = l[0][d];
        l3[j * 6 + 3 + d] = l[1][d];
      }
      // which of the four product segments this piece of the mark belongs to (by its x)
      var mx = (l[0][0] + l[1][0]) / 2;
      group[j] = Math.max(0, Math.min(3, Math.floor((mx / LOGO_WIDTH + 0.5) * 4)));
    }
    return {
      a4: a4,
      l3: l3,
      group: group,
      textWide: flat3(subdivide(textEdges(PHRASE_WIDE, TEXT_WIDTH_WIDE), SEGMENTS)),
      textNarrow: flat3(subdivide(textEdges(PHRASE_NARROW, TEXT_WIDTH_NARROW), SEGMENTS)),
    };
  }

  // ── timeline ────────────────────────────────────────────────────────────────────────────
  function ease(t) {
    t = Math.min(1, Math.max(0, t));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  }

  // f: 4th axis collapsed (0 open .. 1 flat), m: cube -> mark (0 .. 1), e: segments apart (0 .. 1),
  // spin: how far the 4D turn has run (it unwinds while folding and restarts from 0 on unfold,
  // so the loop closes without a jump).
  function phaseAt(c) {
    if (c < 4.5) return { name: "TESSERACT", f: 0, m: 0, e: 0, spin: c };
    if (c < 6) return { name: "FOLD", f: ease((c - 4.5) / 1.5), m: 0, e: 0, spin: 4.5 };
    if (c < 8) return { name: "RESOLVE", f: 1, m: ease((c - 6) / 2), e: 0, spin: 4.5 };
    if (c < 14) return { name: "KANASAKA", f: 1, m: 1, e: 0, spin: 4.5 };
    if (c < 15.5) return { name: "SPLIT", f: 1, m: 1, e: ease((c - 14) / 1.5), spin: 4.5 };
    if (c < 18.5) return { name: "PRODUCTS", f: 1, m: 1, e: 1, spin: 4.5 };
    if (c < 20) return { name: "FUSE", f: 1, m: 1, e: 1 - ease((c - 18.5) / 1.5), spin: 4.5 };
    if (c < 21.5) return { name: "REFORM", f: 1, m: 1 - ease((c - 20) / 1.5), e: 0, spin: 4.5 };
    return { name: "UNFOLD", f: 1 - ease((c - 21.5) / 1.5), m: 0, e: 0, spin: 0 };
  }

  // the number shown under the name: a real parameter of the current stage
  function readout(p, state) {
    var deg = function (rad) {
      return ((((rad * 180) / Math.PI) % 360) + 360) % 360;
    };
    if (p.name === "EVOLUTION") return "T- " + Math.max(0, p.left).toFixed(1).padStart(4, "0");
    if (p.name === "TESSERACT") return "XW " + deg(state.wAngle).toFixed(1).padStart(5, "0");
    if (p.name === "FOLD" || p.name === "UNFOLD") return "W " + (1 - p.f).toFixed(2);
    if (p.name === "RESOLVE" || p.name === "REFORM") return "M " + p.m.toFixed(2);
    if (p.name === "SPLIT" || p.name === "FUSE" || p.name === "PRODUCTS") return "E " + p.e.toFixed(2);
    return "RY " + deg(state.yaw).toFixed(1).padStart(5, "0");
  }

  function init() {
    var hero = document.getElementById("hero-wire");
    var canvas = document.getElementById("hw-canvas");
    if (!window.KanasakaWireFont) return;
    var hud = document.getElementById("hw-hud");
    if (!hero || !canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var root = document.documentElement;
    var morph = buildMorph();
    var pts = new Float64Array(SEGMENTS * 6); // screen x, y and depth for both ends
    var depthOf = new Float64Array(SEGMENTS);
    var dpr = 1;
    var width = 0;
    var height = 0;
    var ink = "#dfe5eb";
    var pointer = null;
    var tiltX = 0;
    var tiltY = 0;
    var running = false;
    var rafId = 0;
    var tabVisible = !document.hidden;
    var onScreen = true;
    var elapsed = 0; // wall time since the hero showed: drives the lock-on intro
    var clock = 0; // motion time: runs slower under "reduced"
    var last = 0;
    var motionOff = reducedMotion();
    var shift = 0; // clock time spent inside the egg: the loop's own time is clock - shift
    var egg = null; // { wall, clock, c0 } while the words are on screen
    var lastCycle = -1;

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

    function stillOr(t) {
      return motionOff ? STILL_AT : t;
    }

    function resize() {
      var rect = hero.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!running) render(stillOr(clock));
    }

    function introNow() {
      return motionOff ? 1 : Math.min(1, elapsed / (INTRO_MS / 1000));
    }

    function sessionAgeMs() {
      var start = 0;
      try {
        start = Number(window.sessionStorage.getItem(SESSION_KEY)) || 0;
        if (!start) {
          start = Date.now();
          window.sessionStorage.setItem(SESSION_KEY, String(start));
        }
      } catch (e) {
        start = 0;
      }
      return start ? Date.now() - start : 0;
    }

    function eggShown() {
      try {
        return window.sessionStorage.getItem(EGG_KEY) === "1";
      } catch (e) {
        return false;
      }
    }

    function eggDue() {
      if (motionOff || eggShown()) return false;
      return /[?&]egg\b/.test((window.location && window.location.search) || "") || sessionAgeMs() >= EGG_AFTER_MS;
    }

    function startEgg(t) {
      egg = { wall: elapsed, clock: t, c0: (t - shift) % CYCLE };
      try {
        window.sessionStorage.setItem(EGG_KEY, "1");
      } catch (e) {
        // storage blocked: it may show again on the next page view, which is harmless
      }
    }

    // Which stage is on screen at motion time t. Called once per frame; it is also where the
    // egg starts (when a new loop begins and the session is old enough) and ends.
    function stage(t) {
      if (!egg && !motionOff) {
        var cycle = Math.floor((t - shift) / CYCLE);
        if (cycle > lastCycle) {
          lastCycle = cycle;
          if (eggDue()) startEgg(t);
        }
      }
      if (egg) {
        var w = elapsed - egg.wall;
        if (w >= EGG_TOTAL) {
          shift += t - egg.clock; // the loop resumes exactly where it stopped
          egg = null;
        } else {
          var amount = w < EGG_IN ? ease(w / EGG_IN) : w < EGG_IN + EGG_HOLD ? 1 : 1 - ease((w - EGG_IN - EGG_HOLD) / EGG_OUT);
          return { name: "EVOLUTION", f: 0, m: 0, e: 0, spin: egg.c0, egg: amount, left: EGG_TOTAL - w };
        }
      }
      return phaseAt(((t - shift) % CYCLE + CYCLE) % CYCLE);
    }

    var out2 = [0, 0];
    function rot(x, y, ang) {
      var c = Math.cos(ang);
      var s = Math.sin(ang);
      out2[0] = x * c - y * s;
      out2[1] = x * s + y * c;
    }

    var OFF_X = [-0.5, -0.17, 0.17, 0.5];
    var OFF_Y = [-0.3, 0.3, -0.3, 0.3];
    var OFF_Z = [0.14, -0.1, 0.1, -0.14];

    // Every segment's screen position for time t. Returns the box around the whole shape and
    // around each of the four product segments.
    function layout(t, p) {
      var compact = width < PHONE_MAX;
      var R = Math.min(height * 0.22, width * (compact ? 0.23 : 0.3));
      var cx = width / 2;
      var cy = height * 0.4; // above the headline
      var open = 1 - p.f;
      var a = {
        xw: p.spin * 0.3 * open,
        yw: p.spin * 0.2 * open + 0.6 * open,
        zw: -p.spin * 0.12 * open,
        xy: t * 0.16,
        yz: t * 0.22 + 0.5,
        xz: t * 0.17,
      };
      var norm = D4 / (D4 - open);
      var yaw = Math.sin(t * 0.5) * 0.5;
      var pitch = 0.08;
      var spread = compact ? 0.6 : 1;
      var text = compact ? morph.textNarrow : morph.textWide;
      // keep the words inside the screen on tall, narrow windows
      var fit = Math.min(1, (width * 0.84) / ((compact ? TEXT_WIDTH_NARROW : TEXT_WIDTH_WIDE) * R));

      var box = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
      var groups = [0, 1, 2, 3].map(function () {
        return { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
      });
      var P = [0, 0, 0];
      var Q = [0, 0, 0];

      function tesseractPoint(o, base) {
        var x = morph.a4[base];
        var y = morph.a4[base + 1];
        var z = morph.a4[base + 2];
        var w = morph.a4[base + 3];
        rot(x, w, a.xw); x = out2[0]; w = out2[1];
        rot(y, w, a.yw); y = out2[0]; w = out2[1];
        rot(z, w, a.zw); z = out2[0]; w = out2[1];
        rot(x, y, a.xy); x = out2[0]; y = out2[1];
        rot(y, z, a.yz); y = out2[0]; z = out2[1];
        rot(x, z, a.xz); x = out2[0]; z = out2[1];
        var k = (D4 / (D4 - w * open) / norm) * TESS_SCALE;
        o[0] = x * k;
        o[1] = y * k;
        o[2] = z * k;
      }

      function logoPoint(o, base, g) {
        var x = morph.l3[base];
        var y = morph.l3[base + 1];
        var z = morph.l3[base + 2];
        var drift = Math.sin(t * 0.6 + g * 1.7) * 0.025 * p.e;
        x += OFF_X[g] * p.e * spread;
        y += (OFF_Y[g] * p.e + drift) * (compact ? 1.3 : 1);
        z += OFF_Z[g] * p.e;
        rot(x, z, yaw); x = out2[0]; z = out2[1];
        rot(y, z, pitch); y = out2[0]; z = out2[1];
        o[0] = x;
        o[1] = y;
        o[2] = z;
      }

      function textPoint(o, base) {
        var x = text[base] * fit;
        var y = text[base + 1] * fit;
        var z = text[base + 2] * fit;
        // a slow swing and tilt so the depth of the letters shows
        rot(x, z, Math.sin(t * 0.5) * 0.45);
        x = out2[0];
        z = out2[1];
        rot(y, z, 0.1 + Math.sin(t * 0.3) * 0.08);
        o[0] = x;
        o[1] = out2[0];
        o[2] = out2[1];
      }

      function grow(b, x, y) {
        b.l = Math.min(b.l, x);
        b.r = Math.max(b.r, x);
        b.t = Math.min(b.t, y);
        b.b = Math.max(b.b, y);
      }

      for (var i = 0; i < SEGMENTS; i += 1) {
        var g = morph.group[i];
        for (var end = 0; end < 2; end += 1) {
          tesseractPoint(P, i * 8 + end * 4);
          if (p.egg > 0) {
            textPoint(Q, i * 6 + end * 3);
            P[0] += (Q[0] - P[0]) * p.egg;
            P[1] += (Q[1] - P[1]) * p.egg;
            P[2] += (Q[2] - P[2]) * p.egg;
          } else if (p.m > 0) {
            logoPoint(Q, i * 6 + end * 3, g);
            P[0] += (Q[0] - P[0]) * p.m;
            P[1] += (Q[1] - P[1]) * p.m;
            P[2] += (Q[2] - P[2]) * p.m;
          }
          // pointer tilt, then perspective
          rot(P[0], P[2], tiltY);
          var px = out2[0];
          var pz = out2[1];
          rot(P[1], pz, tiltX);
          var py = out2[0];
          pz = out2[1];
          var k = CAMERA / (CAMERA - pz * 0.6);
          var sx = cx + px * R * k;
          var sy = cy + py * R * k;
          pts[i * 6 + end * 3] = sx;
          pts[i * 6 + end * 3 + 1] = sy;
          pts[i * 6 + end * 3 + 2] = pz;
          grow(box, sx, sy);
          grow(groups[g], sx, sy);
        }
        depthOf[i] = (pts[i * 6 + 2] + pts[i * 6 + 5]) / 2;
      }
      return { box: box, groups: groups, yaw: yaw, wAngle: a.xw };
    }

    function drawEdges() {
      var levels = [0.2, 0.4, 0.68, 0.95];
      var buckets = [[], [], [], []];
      for (var i = 0; i < SEGMENTS; i += 1) {
        var d = depthOf[i];
        buckets[d < -0.45 ? 0 : d < -0.05 ? 1 : d < 0.4 ? 2 : 3].push(i);
      }
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      buckets.forEach(function (list, index) {
        if (!list.length) return;
        ctx.globalAlpha = levels[index];
        ctx.beginPath();
        list.forEach(function (i) {
          ctx.moveTo(pts[i * 6], pts[i * 6 + 1]);
          ctx.lineTo(pts[i * 6 + 3], pts[i * 6 + 4]);
        });
        ctx.stroke();
      });
    }

    // bracket box, dashed crosshair lines through its centre, and a short label
    function drawTracker(box, rows, alpha, intro, labelSide) {
      if (alpha <= 0.01 || !isFinite(box.l)) return;
      var pad = 14 + (1 - easeOut(intro)) * 70;
      var l = box.l - pad;
      var r = box.r + pad;
      var t = box.t - pad;
      var b = box.b + pad;
      var mx = (box.l + box.r) / 2;
      var my = (box.t + box.b) / 2;
      var arm = Math.max(8, Math.min(20, (r - l) * 0.2));
      var fade = alpha * easeOut(intro);

      ctx.save();
      ctx.setLineDash([2, 5]);
      ctx.globalAlpha = 0.16 * fade;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, my); ctx.lineTo(l - 8, my);
      ctx.moveTo(r + 8, my); ctx.lineTo(width, my);
      ctx.moveTo(mx, 0); ctx.lineTo(mx, t - 8);
      ctx.moveTo(mx, b + 8); ctx.lineTo(mx, height);
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

      // The whole shape: beside its bracket (centred under it on phones). A product segment:
      // above its bracket when it sits in the upper row, below it in the lower row, so the
      // labels never land on a neighbour.
      var under = width < PHONE_MAX;
      var flip = !under && r + 150 > width;
      ctx.font = "400 12px " + MONO;
      ctx.textBaseline = "top";
      var tx;
      var ty;
      if (labelSide === "above" || labelSide === "below") {
        ctx.textAlign = under ? "center" : "left";
        tx = under ? mx : l;
        ty = labelSide === "above" ? t - 8 - rows.length * 14 : b + 8;
      } else {
        ctx.textAlign = under ? "center" : flip ? "right" : "left";
        tx = under ? mx : flip ? l - 10 : r + 10;
        ty = under ? b + 8 : t;
      }
      rows.forEach(function (text, i) {
        ctx.globalAlpha = (i === 0 ? 0.92 : 0.55) * fade;
        ctx.fillText(text, tx, ty + i * 14);
      });
    }

    function render(t) {
      var intro = introNow();
      var p = stage(t);
      var state = layout(t, p);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;

      drawEdges();

      var compact = width < PHONE_MAX;
      var single = 1 - Math.min(1, p.e * 1.6);
      var multi = Math.min(1, Math.max(0, (p.e - 0.35) / 0.65));
      drawTracker(state.box, ["//OBJ_01 " + p.name, "SEG " + SEGMENTS, readout(p, state)], single, intro, null);
      state.groups.forEach(function (box, g) {
        var product = PRODUCTS[g];
        var rows = compact
          ? ["//" + product.name]
          : ["//OBJ_0" + (g + 2) + " " + product.name, product.status, "SEG " + SEGMENTS / 4];
        drawTracker(box, rows, multi, intro, g % 2 ? "below" : "above");
      });

      ctx.font = "400 12px " + MONO;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.globalAlpha = 0.5 * easeOut(intro);
      ctx.fillText("//TRACK " + (multi > 0.5 ? "04" : "01") + " OBJ", Math.max(20, width * 0.04), 24);
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (!running) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      elapsed += dt;
      clock += dt * speed();
      // the tilt follows the pointer with a little lag
      var follow = Math.min(1, dt * 4);
      var wantY = pointer ? (pointer.x / width - 0.5) * 0.5 : 0;
      var wantX = pointer ? (pointer.y / height - 0.5) * -0.3 : 0;
      tiltY += (wantY - tiltY) * follow;
      tiltX += (wantX - tiltX) * follow;
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

    // the labels are drawn with the site's mono face: make sure it is loaded, then repaint
    if (document.fonts && document.fonts.load) {
      document.fonts.load('400 12px "Share Tech Mono"').then(function () {
        if (!running) render(stillOr(clock));
      }).catch(function () {});
    }
    // the scroll hint goes for good at the first scroll
    var hint = document.getElementById("scroll-hint");
    if (hint) {
      var dismiss = function () {
        if ((window.scrollY || window.pageYOffset || 0) > 24) {
          hint.classList.add("is-gone");
          window.removeEventListener("scroll", dismiss);
        }
      };
      window.addEventListener("scroll", dismiss, { passive: true });
      dismiss();
    }

    readInk();
    resize();
    setHud();
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
      },
      { passive: true }
    );
    hero.addEventListener("pointerleave", function () {
      pointer = null;
    });

    new MutationObserver(function () {
      readInk();
      if (!running) render(stillOr(clock));
    }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    if (window.KanasakaMotion) {
      window.KanasakaMotion.onChange(function () {
        var off = reducedMotion();
        if (off === motionOff) return;
        motionOff = off;
        if (motionOff) {
          if (rafId) window.cancelAnimationFrame(rafId);
          running = false;
          render(STILL_AT);
        } else {
          sync();
        }
      });
    }
  }

  window.KanasakaHeroWire = { init: init };
})();
