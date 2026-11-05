(function () {
  const RAMP = " .:-=+*#%@";
  const MASK_SCALE = 6;

  // The KS logos (assets/logo/ks-vertical.svg, ks-horizontal.svg) as polygons
  // in their own units: first loop is the outline, the rest are the holes.
  // Drawn with the even-odd rule, so nothing else needs to know which is which.
  //
  // Phones (< PHONE_MAX px wide) get the vertical mark, everything wider --
  // tablets in either orientation and desktop -- gets the horizontal one.
  const PHONE_MAX = 768;

  // How much of the hero field the mark takes up, and where its vertical
  // centre sits (as a fraction of the field's height). The vertical mark is
  // sized by height, the horizontal one by width.
  const VERTICAL_SPAN = 0.78; // of field height
  const HORIZONTAL_SPAN = 0.62; // of field width
  const HORIZONTAL_SPAN_TALL = 0.76; // same, when the field is taller than wide (tablet portrait)
  const LOGO_CENTER_Y = 0.474;

  // Character flipping (like a departure board): every so often a core logo
  // cell flips through a few random hex digits, then settles back on its own
  // character. Each cell has its own period and offset, so flips are scattered
  // and never sweep across the mark in a wave. Edge cells never flip, which
  // keeps the silhouette crisp.
  const FLIP_CHARS = "0123456789ABCDEF";
  // The field updates on one fixed tick (about 15 Hz), the same on every device:
  // a deliberate terminal-clock cadence next to the 60 fps UI, instead of a rate
  // that used to drift between 10 and 30 fps with the device. Everything in the
  // field (noise drift, hex flips, scan band, ripple, tear) steps on this tick,
  // and the text scramble in motion.js uses the same one.
  const TICK_MS = (window.KanasakaMotion && window.KanasakaMotion.tickMs) || 66;
  const FLIP_STEP_MS = TICK_MS; // how long each flipped character stays (one tick)
  const FLIP_STEPS = 5; // characters shown per flip
  const FLIP_MIN_PERIOD = 2.4; // seconds between one cell's flips
  const FLIP_MAX_PERIOD = 7.5;
  const FLIP_MIN_COVERAGE = 0.6; // only cells at least this covered by the logo

  // Extras gated by the motion layer (html[data-motion] / html[data-fx]; see
  // assets/js/motion.js): fx >= 1 adds the scan band
  // (Dark and Light), fx 2 (Accent) adds the glitch "tear". All of it is
  // arithmetic inside the existing per-cell loop: no extra DOM, no extra loop.
  const BAND_PERIOD = 7; // seconds between scan-band sweeps
  const BAND_SWEEP = 2.4; // seconds one sweep takes
  const BAND_HEIGHT = 3; // rows of falloff either side of the band centre
  const TEAR_MS = 120;

  const LOGO_VERTICAL = {
    name: "KS_V",
    ratio: "1:2",
    w: 762.05,
    h: 1523.4,
    loops: [
      [[0, 0], [101.5, 0], [101.5, 514.75], [615.98, 0], [762.05, 0], [381.05, 380.95], [460.32, 460.3], [762.05, 158.6], [762.05, 304.45], [533.23, 533.2], [762.05, 761.9], [762.05, 863.4], [203.1, 863.4], [101.5, 964.95], [101.5, 1096.65], [762.05, 1096.65], [762.05, 1370.83], [609.6, 1523.4], [0, 1523.4], [0, 1422.02], [565.35, 1422.02], [660.25, 1326.95], [660.25, 1198.28], [0, 1198.28]],
      [[307.67, 453.71], [387.75, 533.2], [101.5, 819.22], [101.5, 660.32]],
      [[460.32, 605.63], [615.98, 761.9], [307.67, 761.9]],
    ],
  };
  const LOGO_HORIZONTAL = {
    name: "KS_H",
    ratio: "2:1",
    w: 1523.6,
    h: 761.85,
    loops: [
      [[0, 0], [101.6, 0], [101.6, 514.4], [615.98, 0], [761.75, 0], [380.73, 380.7], [460.22, 460.1], [920.35, 0], [1523.6, 0], [1523.6, 101.8], [964.6, 101.8], [863.1, 203.08], [863.1, 334.88], [1523.6, 334.88], [1523.6, 606.05], [1371.35, 761.85], [615.98, 761.85], [460.22, 606.05], [307.35, 761.85], [0, 761.85]],
      [[761.75, 304.45], [761.75, 436.43], [1421.9, 436.43], [1421.9, 565.2], [1326.98, 660.12], [659.85, 660.12], [533.25, 533]],
      [[307.35, 453.7], [387.48, 533], [260.35, 660.12], [101.6, 660.12]],
    ],
  };

  // Fills `logo` into ctx, centred on x = 0 with its top edge at topY and
  // `heightPx` tall. The ctx is expected to already carry the horizontal
  // stretch that compensates for tall character cells.
  function drawLogo(ctx, logo, topY, heightPx) {
    const scale = heightPx / logo.h;
    const offsetX = -(logo.w * scale) / 2;
    ctx.beginPath();
    logo.loops.forEach(function (loop) {
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

  function rootAttr(name) {
    return document.documentElement.getAttribute(name);
  }

  // OS reduce-motion or the in-app "Off": render once, never animate
  function motionIsOff() {
    return prefersReducedMotion() || rootAttr("data-motion") === "off";
  }

  function extrasLevel() {
    return rootAttr("data-motion") === "full" ? Number(rootAttr("data-fx") || 0) : 0;
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

  // Every run's opening <span> tag only ever depends on (isLetter, tier) --
  // a fixed set of 10 letter tiers + 4 ambient tiers -- so the tag can be
  // built once instead of concatenated fresh for every run, every frame. The
  // tiers are CSS classes (home.css): the site CSP forbids inline style
  // attributes. Index: ambient tiers at 0-9, letter tiers
  // (offset +100 like the render loop's `key`) at 100-109.
  const SPAN_OPEN = new Array(210);
  for (let tier = 1; tier <= 4; tier++) {
    SPAN_OPEN[tier] = '<span class="ha-a' + tier + '">';
  }
  for (let tier = 0; tier < RAMP.length; tier++) {
    SPAN_OPEN[100 + tier] = '<span class="ha-l' + tier + '">';
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
    const fieldEl = document.getElementById("ha-field");
    const fieldWrap = document.querySelector(".ha-field-wrap");
    if (!hero || !fieldEl || !fieldWrap) return;

    let reduced = motionIsOff();
    const hudH = document.getElementById("ha-hud-h");

    let cols = 0;
    let rows = 0;
    let letterMask = null;
    // per-cell flip schedule and static grain (see FLIP_* above)
    let flipPeriod = null;
    let flipOffset = null;
    let cellGrain = null;
    let cellW = 5;
    let cellH = 8;
    let activeLogo = LOGO_VERTICAL;
    let logoSpan = VERTICAL_SPAN;
    // Set by the capability probe below, right after the first real
    // measure() -- read from syncRunning() too, so hardware that's
    // already been judged too slow for continuous animation can't have
    // the loop re-started later by an unrelated IntersectionObserver/
    // visibilitychange event (scrolling the hero out of view and back,
    // say). See the probe itself for what decides this.
    let forceStatic = false;

    // accent tear
    let nextTearAt = 8 + Math.random() * 6;
    let tearUntil = 0;
    let tearY0 = 0;
    let tearY1 = 0;
    let tearShift = 0;

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

      // Centred on the field's horizontal midpoint. The logo keeps its true
      // proportions: character cells are much taller than wide (cellH >> cellW),
      // so the x axis is stretched by cellH / cellW to compensate. One drawing
      // unit is therefore cellH / MASK_SCALE screen pixels in both directions.
      activeLogo = window.innerWidth < PHONE_MAX ? LOGO_VERTICAL : LOGO_HORIZONTAL;
      let logoHeight;
      if (activeLogo === LOGO_VERTICAL) {
        logoSpan = VERTICAL_SPAN;
        logoHeight = mh * logoSpan;
      } else {
        logoSpan = rows * cellH > cols * cellW ? HORIZONTAL_SPAN_TALL : HORIZONTAL_SPAN;
        const widthUnits = ((cols * cellW) / cellH) * MASK_SCALE * logoSpan;
        logoHeight = widthUnits * (activeLogo.h / activeLogo.w);
      }
      const logoTop = mh * LOGO_CENTER_Y - logoHeight / 2;
      mctx.save();
      mctx.translate(mw / 2, 0);
      mctx.scale(cellH / cellW, 1);
      drawLogo(mctx, activeLogo, logoTop, logoHeight);
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

      if (!flipPeriod || flipPeriod.length !== cols * rows) {
        flipPeriod = new Float32Array(cols * rows);
        flipOffset = new Float32Array(cols * rows);
        cellGrain = new Float32Array(cols * rows);
        for (let i = 0; i < flipPeriod.length; i++) {
          flipPeriod[i] = FLIP_MIN_PERIOD + Math.random() * (FLIP_MAX_PERIOD - FLIP_MIN_PERIOD);
          flipOffset[i] = Math.random() * flipPeriod[i];
          cellGrain[i] = Math.random();
        }
      }
    }

    function measure() {
      const cell = measureCell(fieldEl);
      cellW = cell.w || cellW;
      cellH = cell.h || cellH;

      const wrapRect = fieldWrap.getBoundingClientRect();
      cols = Math.floor(wrapRect.width / cellW);
      rows = Math.floor(wrapRect.height / cellH);

      buildLetterMask();

      const hudV = document.getElementById("ha-hud-v");
      if (hudH) {
        hudH.textContent = "//GRID " + cols + "x" + rows + "  //CELL " + cellW.toFixed(1) + "x" + cellH.toFixed(0) + "PX";
      }
      if (hudV) {
        hudV.textContent =
          "//MASK " + activeLogo.name + " " + activeLogo.ratio + "  //SPAN " + Math.round(logoSpan * 100) + "%  //TICK " + Math.round(1000 / TICK_MS) + "HZ  //FLIP HEX " + FLIP_STEP_MS + "MS";
      }
    }

    window.addEventListener("resize", measure);
    measure();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(function () {});
    }

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

      const fxLvl = reduced ? 0 : extrasLevel();

      // scan band: a soft horizontal highlight sweeping down the field
      let bandRow = -99;
      if (fxLvl >= 1) {
        const phase = (t % BAND_PERIOD) / BAND_SWEEP;
        if (phase < 1) bandRow = phase * (rows + BAND_HEIGHT * 2) - BAND_HEIGHT;
      }

      // accent only: now and then a few rows shear sideways for 120 ms
      if (fxLvl >= 2) {
        if (t >= nextTearAt && tearUntil === 0) {
          tearUntil = t + TEAR_MS / 1000;
          tearY0 = Math.floor(Math.random() * Math.max(1, rows - 6));
          tearY1 = tearY0 + 3 + Math.floor(Math.random() * 4);
          tearShift = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
        } else if (tearUntil && t >= tearUntil) {
          tearUntil = 0;
          nextTearAt = t + 12 + Math.random() * 8;
        }
      } else if (tearUntil) {
        tearUntil = 0;
      }

      for (let y = 0; y < rows; y++) {
        let runChar = "";
        let runKey = null;
        const runs = [];
        const ny = y * 0.16 - driftY;
        const rowMaskOffset = y * cols;
        const shift = tearUntil && y >= tearY0 && y < tearY1 ? tearShift : 0;
        const bandBoost = bandRow > -99 ? Math.max(0, 1 - Math.abs(y - bandRow) / BAND_HEIGHT) : 0;

        for (let x = 0; x < cols; x++) {
          const nx = x * 0.09 + driftX;
          let v = fbm(nx, ny);

          const sx = shift ? x - shift : x;
          const m = letterMask && sx >= 0 && sx < cols ? letterMask[rowMaskOffset + sx] : 0;
          const isLetter = m > 0.1;

          let flipChar = "";
          if (isLetter) {
            // static grain: each cell sits a little differently in the dense
            // end of the ramp, so the mark reads as textured, not flat
            const idx = rowMaskOffset + sx;
            const base = m * (0.84 + (cellGrain ? cellGrain[idx] : 0.5) * 0.11);
            v = Math.max(v, base);

            if (!reduced && flipPeriod && m > FLIP_MIN_COVERAGE) {
              const local = t + flipOffset[idx];
              const cycle = Math.floor(local / flipPeriod[idx]);
              const step = Math.floor(((local - cycle * flipPeriod[idx]) * 1000) / FLIP_STEP_MS);
              if (step < FLIP_STEPS) {
                const h = (Math.imul(idx, 73856093) ^ Math.imul(step + 1, 19349663) ^ Math.imul(cycle + 1, 83492791)) >>> 0;
                flipChar = FLIP_CHARS.charAt(h % FLIP_CHARS.length);
              }
            }
          }
          if (bandBoost) v += bandBoost * 0.42;
          v = Math.max(0, Math.min(1, v));

          // ambient cells stay within a narrow mid-density band so the field
          // reads as an even, subtle texture instead of high-contrast
          // speckling; letters alone get to use the full ramp.
          const tier = isLetter ? Math.floor(v * (RAMP.length - 1)) : 1 + Math.floor(v * 4);
          const ch = flipChar || RAMP[tier];
          const key = flipChar ? 109 : tier + (isLetter ? 100 : 0);

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

    // Fixed tick instead of an adaptive rate: render when the tick index changes
    // and hand render() the quantized time, so every moving part steps in
    // lock-step and a stalled frame never makes the field catch up in a burst.
    //
    // Cost guard: the time from starting a render to the next animation frame
    // includes the browser's layout and paint of the rewritten field, which is
    // most of the real cost. If its rolling average exceeds 90 % of the tick the
    // field drops ONCE to a half-rate tick (still fixed, still deliberate), and if
    // that is too much as well it stops on its current frame, like the capability
    // probe below does up front. It never wanders between rates.
    let tickMs = TICK_MS;
    let lastTick = -1;
    let renderedAt = 0;
    let costSum = 0;
    let costCount = 0;

    function frame(now) {
      if (!running) return;

      if (renderedAt) {
        costSum += now - renderedAt;
        costCount += 1;
        renderedAt = 0;
        if (costCount >= 20) {
          if (costSum / costCount > tickMs * 0.9) {
            if (tickMs === TICK_MS) {
              tickMs = TICK_MS * 2;
              lastTick = -1;
              const hudV = document.getElementById("ha-hud-v");
              if (hudV) hudV.textContent = hudV.textContent.replace(/TICK \d+HZ/, "TICK " + Math.round(1000 / tickMs) + "HZ");
            } else {
              forceStatic = true;
              running = false;
              return;
            }
          }
          costSum = 0;
          costCount = 0;
        }
      }

      const tick = Math.floor((now - start) / tickMs);
      if (tick !== lastTick) {
        lastTick = tick;
        renderedAt = performance.now();
        render(start + tick * tickMs);
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
      const shouldRun = tabVisible && onScreen && !forceStatic && !reduced;
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
        // stop the 30 fps DOM rewrite once the hero is nearly out of view, not
        // only when its last pixel has left (it competes with everything else)
        { threshold: 0.25 }
      );
      io.observe(hero);
    }

    document.addEventListener("visibilitychange", function () {
      tabVisible = !document.hidden;
      syncRunning();
    });

    // the in-app Motion setting / OS setting changed while the page is open
    if (window.KanasakaMotion) {
      window.KanasakaMotion.onChange(function () {
        const off = motionIsOff();
        if (off === reduced) return;
        reduced = off;
        if (reduced) {
          running = false;
          if (rafId) window.cancelAnimationFrame(rafId);
          render(performance.now());
        } else {
          syncRunning();
        }
      });
    }

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
    // below. The budget is half a tick (about 33 ms): the field only has to
    // finish well inside its fixed 66 ms tick, and past that the honest answer
    // is to render the same thing once.
    if (!reduced && cols && rows) {
      render(performance.now());
      render(performance.now());
      const probeStart = performance.now();
      render(performance.now());
      void fieldEl.offsetHeight; // include the layout of the rewritten field
      forceStatic = performance.now() - probeStart > TICK_MS / 2;
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
