(function () {
  const RAMP = " .:-=+*#%@";
  const MASK_SCALE = 6;

  // The vertical KS logo (assets/logo/ks-vertical.svg) as polygons in its own
  // units: first loop is the outline, the rest are the holes. Drawn with the
  // even-odd rule, so nothing else needs to know which is which.
  const LOGO_WIDTH = 762.05;
  const LOGO_HEIGHT = 1523.4;
  const LOGO_LOOPS = [
    [[0, 0], [101.5, 0], [101.5, 514.75], [615.98, 0], [762.05, 0], [381.05, 380.95], [460.32, 460.3], [762.05, 158.6], [762.05, 304.45], [533.23, 533.2], [762.05, 761.9], [762.05, 863.4], [203.1, 863.4], [101.5, 964.95], [101.5, 1096.65], [762.05, 1096.65], [762.05, 1370.83], [609.6, 1523.4], [0, 1523.4], [0, 1422.02], [565.35, 1422.02], [660.25, 1326.95], [660.25, 1198.28], [0, 1198.28]],
    [[307.67, 453.71], [387.75, 533.2], [101.5, 819.22], [101.5, 660.32]],
    [[460.32, 605.63], [615.98, 761.9], [307.67, 761.9]],
  ];

  // Fills the logo into ctx, centred on x = 0 with its top edge at topY and
  // `heightPx` tall. The ctx is expected to already carry the horizontal
  // stretch that compensates for tall character cells.
  function drawLogo(ctx, topY, heightPx) {
    const scale = heightPx / LOGO_HEIGHT;
    const offsetX = -(LOGO_WIDTH * scale) / 2;
    ctx.beginPath();
    LOGO_LOOPS.forEach(function (loop) {
      loop.forEach(function (point, i) {
        const px = point[0] * scale + offsetX;
        const py = point[1] * scale + topY;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    });
    ctx.fill("evenodd");
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // hash() is a pure function of its (integer) inputs but was recomputing
  // Math.sin(...)*43758.5453 live on every call -- 4x per noise(), 3x per
  // fbm(), so every one of the thousands of grid cells cost up to 12 sin()
  // evaluations, every rendered frame. Neighbouring cells sample nx/ny only
  // ~0.09/0.16 apart, so ~11-16 consecutive cells share the same floored
  // lattice point -- the same handful of (xi,yi) pairs get re-hashed
  // dozens of times per row. Memoizing per frame (cache cleared at the top
  // of render()) turns that into one sin() per unique lattice point instead
  // of one per cell -- exact same values, just not recomputed redundantly.
  //
  // The memo key itself turned out to be the single biggest remaining cost
  // on slow hardware -- profiled a representative 200x42 grid (8400 cells)
  // at ~4.8ms/frame average with a `x + "," + y` string key, vs ~0.9ms/frame
  // (5.3x faster, same exact output) just by packing (x,y) into one number
  // instead. V8 hashes/compares a Map's numeric keys directly; a string key
  // means allocating a fresh string and hashing its characters on every
  // single lookup, including the ~8400-per-frame cache HITS, not just the
  // ~650 unique misses the comment above was optimizing for. `1e7` as the
  // row multiplier is wildly more headroom than yi/xi ever need in
  // practice -- drift (state.js's t*0.025/t*0.016) would need the tab open
  // continuously for roughly a year before xi approached it, comfortably
  // inside Number.MAX_SAFE_INTEGER the whole way.
  let hashCache = new Map();
  function hash(x, y) {
    const key = y * 1e7 + x;
    let v = hashCache.get(key);
    if (v === undefined) {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      v = s - Math.floor(s);
      hashCache.set(key, v);
    }
    return v;
  }
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash(xi, yi), b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const ux = xf * xf * (3 - 2 * xf);
    const uy = yf * yf * (3 - 2 * yf);
    return a + (b - a) * ux + (c - a) * uy * (1 - ux) + (d - b) * ux * uy;
  }
  function fbm(x, y) {
    let v = 0, a = 0.5, xx = x, yy = y;
    for (let i = 0; i < 3; i++) {
      v += a * noise(xx, yy);
      xx *= 2.02;
      yy *= 2.02;
      a *= 0.55;
    }
    return v;
  }

  const COLUMNS = [
    {
      head: null,
      lines: [
        { t: "KANASAKA", cls: "ha-brand" },
      ],
    },
    {
      head: "Products",
      lines: [
        { t: "KS_Link", cls: "ha-item", href: "/products/ks-link/" },
      ],
    },
    {
      head: "Company",
      lines: [
        { t: "About", cls: "ha-item", href: "/company/about/" },
        { t: "Vision", cls: "ha-item", href: "/company/vision/" },
        { t: "Leadership", cls: "ha-item", href: "/company/leadership/" },
        { t: "News", cls: "ha-item", href: "/company/news/" },
        { t: "Careers", cls: "ha-item", href: "/company/careers/" },
      ],
    },
    {
      head: "Developers",
      lines: [
        { t: "API", cls: "ha-item", href: "/developers/api/" },
        { t: "SDK", cls: "ha-item", href: "/developers/sdk/" },
        { t: "GitHub", cls: "ha-item", href: "/developers/github/" },
        { t: "Docs", cls: "ha-item", href: "/developers/documentation/" },
      ],
    },
  ];

  // Every run's opening <span> tag only ever depends on (isLetter, tier) --
  // a fixed set of 10 letter tiers + 4 ambient tiers -- so the opacity/color
  // string can be built once instead of toFixed()'d and concatenated fresh
  // for every run, every frame. Index: ambient tiers at 0-9, letter tiers
  // (offset +100 like the render loop's `key`) at 100-109.
  const SPAN_OPEN = new Array(210);
  for (let tier = 1; tier <= 4; tier++) {
    const frac = (tier - 1) / 3;
    SPAN_OPEN[tier] = '<span style="opacity:' + (0.36 + frac * 0.3).toFixed(2) + ';color:inherit">';
  }
  for (let tier = 0; tier < RAMP.length; tier++) {
    const frac = tier / (RAMP.length - 1);
    SPAN_OPEN[100 + tier] =
      '<span style="opacity:' + (0.68 + frac * 0.32).toFixed(2) + ';color:var(--color-text)">';
  }

  function canSeeGated(id) {
    return (
      window.KanasakaAuth &&
      window.KanasakaAuth.canSeeAccountGated &&
      window.KanasakaAuth.canSeeAccountGated(id)
    );
  }

  function buildColumns(colsEl) {
    COLUMNS.forEach(function (col) {
      const div = document.createElement("div");
      div.className = "ha-col";
      const rows = [];
      if (col.head) {
        rows.push('<span class="ha-head">' + col.head + "</span>");
        rows.push("");
      }
      col.lines.forEach(function (l) {
        if (l.gated && !canSeeGated(l.gated)) return;
        if (l.href) {
          rows.push('<a class="' + l.cls + '" href="' + l.href + '">' + l.t + "</a>");
        } else {
          rows.push('<span class="' + l.cls + '">' + l.t + "</span>");
        }
      });
      div.innerHTML = rows.join("\n");
      colsEl.appendChild(div);
    });
  }

  function measureCell(el) {
    const probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "pre";
    probe.textContent = "0000000000";
    el.appendChild(probe);
    const w = probe.getBoundingClientRect().width / 10;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    el.removeChild(probe);
    return { w: w, h: lineHeight };
  }

  function init() {
    const hero = document.getElementById("hero-ascii");
    const colsEl = document.getElementById("ha-cols");
    const fieldEl = document.getElementById("ha-field");
    const fieldWrap = document.querySelector(".ha-field-wrap");
    if (!hero || !colsEl || !fieldEl || !fieldWrap) return;

    buildColumns(colsEl);

    const reduced = prefersReducedMotion();

    let cols = 0;
    let rows = 0;
    let contentColsWidth = 0;
    let startCol = 0;
    let letterMask = null;
    let cellW = 5;
    let cellH = 8;
    // Set by the capability probe below, right after the first real
    // measure() -- read from syncRunning() too, so hardware that's
    // already been judged too slow for continuous animation can't have
    // the loop re-started later by an unrelated IntersectionObserver/
    // visibilitychange event (scrolling the hero out of view and back,
    // say). See the probe itself for what decides this.
    let forceStatic = false;

    function buildLetterMask() {
      if (!cols || !rows) return;
      const mw = cols * MASK_SCALE;
      const mh = rows * MASK_SCALE;
      const mc = document.createElement("canvas");
      mc.width = mw;
      mc.height = mh;
      const mctx = mc.getContext("2d");
      mctx.fillStyle = "#000";
      mctx.fillRect(0, 0, mw, mh);
      mctx.fillStyle = "#fff";

      // Centred on the window's true horizontal midpoint (not the field area
      // to the right of the nav columns). The logo keeps its true 1:2 shape:
      // character cells are much taller than wide (cellH >> cellW), so the
      // x axis is stretched by cellH / cellW to compensate.
      const logoHeight = mh * 0.78;
      const logoTop = mh * 0.474 - logoHeight / 2;
      mctx.save();
      mctx.translate(mw / 2, 0);
      mctx.scale(cellH / cellW, 1);
      drawLogo(mctx, logoTop, logoHeight);
      mctx.restore();

      const data = mctx.getImageData(0, 0, mw, mh).data;
      const mask = new Float32Array(cols * rows);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          let sum = 0;
          for (let sy = 0; sy < MASK_SCALE; sy++) {
            for (let sx = 0; sx < MASK_SCALE; sx++) {
              const px = x * MASK_SCALE + sx;
              const py = y * MASK_SCALE + sy;
              sum += data[(py * mw + px) * 4] / 255;
            }
          }
          mask[y * cols + x] = sum / (MASK_SCALE * MASK_SCALE);
        }
      }
      letterMask = mask;
    }

    function measure() {
      const cell = measureCell(fieldEl);
      cellW = cell.w || cellW;
      cellH = cell.h || cellH;

      const wrapRect = fieldWrap.getBoundingClientRect();
      const colsRect = colsEl.getBoundingClientRect();
      contentColsWidth = colsRect.width + 24;
      cols = Math.floor(wrapRect.width / cellW);
      rows = Math.floor(wrapRect.height / cellH);
      startCol = Math.ceil(contentColsWidth / cellW) + 2;
      buildLetterMask();
    }

    window.addEventListener("resize", measure);
    measure();

    let running = true;
    let rafId = null;
    const start = performance.now();

    function render(now) {
      hashCache.clear();
      const t = (now - start) / 1000;
      const lines = [];

      // hoisted out of the per-cell loop -- these don't vary by x/y, only
      // by frame (t) or by fixed geometry (cellH/cellW), so recomputing
      // them for every one of the thousands of cells was pure waste.
      const driftX = reduced ? 0 : t * 0.025;
      const driftY = reduced ? 0 : t * 0.016;
      const shimmerT = reduced ? 0 : t * 0.5;

      for (let y = 0; y < rows; y++) {
        let runChar = "";
        let runKey = null;
        const runs = [];
        const ny = y * 0.16 - driftY;
        const rowMaskOffset = y * cols;

        for (let x = 0; x < cols; x++) {
          const nx = x * 0.09 + driftX;
          let v = fbm(nx, ny);

          const m = letterMask ? letterMask[rowMaskOffset + x] : 0;
          const isLetter = m > 0.1;

          if (isLetter) {
            // the letters run their own local shimmer -- a slow, broad
            // breathing across the mark's own coordinates on its own clock
            // -- instead of inheriting the ambient field's drift. Kept
            // deliberately gentle: a quiet ambient quality, not a sweep.
            const shimmer = Math.sin(x * 0.1 + y * 0.16 - shimmerT) * 0.5 + 0.5;
            const base = m * (0.82 + shimmer * 0.13);
            v = Math.max(v, base);
          }
          v = Math.max(0, Math.min(1, v));

          // ambient cells stay within a narrow mid-density band so the field
          // reads as an even, subtle texture instead of high-contrast
          // speckling; letters alone get to use the full ramp.
          const tier = isLetter ? Math.floor(v * (RAMP.length - 1)) : 1 + Math.floor(v * 4);
          const ch = RAMP[tier];
          const key = tier + (isLetter ? 100 : 0);

          if (key !== runKey) {
            if (runChar) runs.push(runKey, runChar);
            runChar = ch;
            runKey = key;
          } else {
            runChar += ch;
          }
        }
        if (runChar) runs.push(runKey, runChar);

        let line = "";
        for (let i = 0; i < runs.length; i += 2) {
          line += SPAN_OPEN[runs[i]] + runs[i + 1] + "</span>";
        }
        lines.push(line);
      }

      fieldEl.innerHTML = lines.join("\n");
    }

    let frameCount = 0;
    // Adaptive throttle: start at ~30fps (render every 2nd rAF tick) and
    // back off further if actual render() cost runs high, so slow hardware
    // settles into a lower update rate instead of pegging the main thread.
    // The noise drift is slow enough that even 10fps reads as smooth, so
    // this never changes what's on screen, only how often it's redrawn.
    let renderEvery = 2;
    let slowFrameStreak = 0;

    function frame(now) {
      if (!running) return;
      frameCount++;
      if (frameCount % renderEvery === 0) {
        const before = performance.now();
        render(now);
        const cost = performance.now() - before;
        if (cost > 8) {
          slowFrameStreak++;
          if (slowFrameStreak >= 5 && renderEvery < 6) {
            renderEvery++;
            slowFrameStreak = 0;
          }
        } else {
          slowFrameStreak = 0;
        }
      }
      rafId = window.requestAnimationFrame(frame);
    }

    // Two independent gates -- tab visibility and hero scroll position --
    // both need to allow running before the rAF loop is (re)started, and
    // either one can stop it. `running` is a single source of truth for
    // "is a frame() chain currently scheduled" so the two observers below
    // can never both schedule one, which would otherwise double up (each
    // scheduled frame() reschedules itself, so two concurrent chains
    // doubles again on every tick).
    let tabVisible = !document.hidden;
    let onScreen = true;

    function syncRunning() {
      const shouldRun = tabVisible && onScreen && !forceStatic;
      if (shouldRun && !running) {
        running = true;
        rafId = window.requestAnimationFrame(frame);
      } else if (!shouldRun && running) {
        running = false;
        if (rafId) window.cancelAnimationFrame(rafId);
      }
    }

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        function (entries) {
          onScreen = entries[entries.length - 1].isIntersecting;
          syncRunning();
        },
        { threshold: 0 }
      );
      io.observe(hero);
    }

    document.addEventListener("visibilitychange", function () {
      tabVisible = !document.hidden;
      syncRunning();
    });

    // Proactive capability check: measure this device's actual cost to
    // render one real frame at the page's real grid size, before ever
    // starting the loop -- not after. The adaptive throttle inside frame()
    // above already backs off once it's *already* paying for several
    // expensive frames in a row, which still means the user sees a few
    // real stutters before it finds that out. This catches hardware
    // that's clearly going to struggle before any of that happens. Two
    // throwaway calls first so the measured cost reflects this hot
    // function's actual steady-state cost on this device, not one-off JIT
    // warmup; each of the three calls already paints a real frame, so
    // hardware that fails the check is left with the same art already on
    // screen, just not animating, same as the prefers-reduced-motion path
    // below. 16ms is one full 60fps frame budget -- past that, continuous
    // animation (even throttled down) reads as stutter, not an ambient
    // effect, so the honest answer is to render the same thing once.
    if (!reduced && cols && rows) {
      render(performance.now());
      render(performance.now());
      const probeStart = performance.now();
      render(performance.now());
      forceStatic = performance.now() - probeStart > 16;
    }

    running = false;
    if (reduced) {
      render(performance.now());
    } else if (!forceStatic) {
      syncRunning();
    }
  }

  window.KanasakaHeroAscii = {
    init: init,
  };
})();
