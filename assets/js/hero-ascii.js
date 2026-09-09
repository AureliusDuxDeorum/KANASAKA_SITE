(function () {
  const RAMP = " .:-=+*#%@";
  const MASK_SCALE = 6;

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function hash(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
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
  function smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
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
        { t: "Software, AI,", cls: "ha-brand-sub" },
        { t: "robotics and", cls: "ha-brand-sub" },
        { t: "biotech.", cls: "ha-brand-sub" },
      ],
    },
    {
      head: "Products",
      lines: [
        { t: "KS Unify", cls: "ha-item", href: "/products/ks-unify/" },
        { t: "KS Stocks", cls: "ha-item", href: "/products/ks-stocks/" },
        { t: "KS-K Mobile", cls: "ha-item", href: "/products/ks-k-mobile/", gated: "dev_ks" },
        { t: "Robotics", cls: "ha-item", href: "/products/robotics/" },
      ],
    },
    {
      head: "Research",
      lines: [
        { t: "AI", cls: "ha-item", href: "/research/artificial-intelligence/" },
        { t: "Robotics", cls: "ha-item", href: "/research/robotics/" },
        { t: "Publications", cls: "ha-item", href: "/research/publications/" },
        { t: "Future work", cls: "ha-item", href: "/research/future-projects/" },
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
    let mouseTarget = [0.5, 0.5];
    let mouseSmooth = [0.5, 0.5];

    function onMouseMove(e) {
      const r = hero.getBoundingClientRect();
      mouseTarget[0] = (e.clientX - r.left) / r.width;
      mouseTarget[1] = (e.clientY - r.top) / r.height;
    }
    if (!reduced) {
      window.addEventListener("mousemove", onMouseMove, { passive: true });
    }

    let cols = 0;
    let rows = 0;
    let contentColsWidth = 0;
    let startCol = 0;
    let letterMask = null;
    let letterCenterCol = 0;
    let letterCenterRow = 0;
    let letterClearRadius = 0;
    let cellW = 5;
    let cellH = 8;

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
      mctx.textAlign = "center";
      mctx.textBaseline = "alphabetic";

      const fieldStartPx = startCol * MASK_SCALE;
      const fieldW = mw - fieldStartPx;
      // sized/positioned with margin so ascenders/descenders never clip
      // against the field bounds, K stacked above S like the wordmark,
      // shifted off dead-center on the x-axis for a less static composition.
      const fieldCenterX = fieldStartPx + fieldW / 2 - fieldW * 0.15;
      const letterSize = mh * 0.44;
      mctx.font = '600 ' + letterSize + 'px "Tektur", ui-monospace, monospace';
      // character cells are much taller than wide (cellH >> cellW), so a
      // glyph drawn "normally" here reads as squeezed on the x-axis once
      // it's re-flattened into that grid — pre-stretch it horizontally to
      // compensate.
      const aspectFix = cellH / cellW;
      mctx.save();
      mctx.translate(fieldCenterX, 0);
      mctx.scale(aspectFix, 1);
      mctx.fillText("K", 0, mh * 0.39);
      mctx.fillText("S", 0, mh * 0.78);
      mctx.restore();

      letterCenterCol = fieldCenterX / MASK_SCALE;
      letterCenterRow = ((0.39 + 0.78) / 2) * rows;
      letterClearRadius = rows * 0.32;

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

    if (document.fonts && document.fonts.load) {
      document.fonts
        .load('600 40px "Tektur"')
        .then(function () {
          buildLetterMask();
        })
        .catch(function () {});
    }

    let running = true;
    let rafId = null;
    const start = performance.now();

    function render(now) {
      const t = (now - start) / 1000;
      mouseSmooth[0] += (mouseTarget[0] - mouseSmooth[0]) * 0.05;
      mouseSmooth[1] += (mouseTarget[1] - mouseSmooth[1]) * 0.05;

      const mx = mouseSmooth[0] * cols;
      const my = mouseSmooth[1] * rows;
      const lines = [];

      for (let y = 0; y < rows; y++) {
        let runChar = "";
        let runKey = null;
        const runs = [];

        for (let x = 0; x < cols; x++) {
          const dx = x - mx;
          const dy = (y - my) * (cellW / cellH);
          const distToMouse = Math.sqrt(dx * dx + dy * dy);
          const ripple = reduced
            ? 0
            : Math.exp(-distToMouse * 0.06) * Math.sin(distToMouse * 0.22 - t * 0.9) * 0.28;

          const nx = x * 0.09 + (reduced ? 0 : t * 0.025);
          const ny = y * 0.16 - (reduced ? 0 : t * 0.016);
          let v = fbm(nx, ny) + ripple;

          const m = letterMask ? letterMask[y * cols + x] : 0;
          const isLetter = m > 0.1;
          if (isLetter) {
            const base = m * (0.7 + fbm(nx * 1.7 + 9.0, ny * 1.7 + 4.0) * 0.35);
            // the K/S react to the cursor much faster and more sharply than
            // the ambient field -- tight falloff so it's felt right where
            // you're hovering, quick oscillation so it visibly flickers
            // between characters instead of just gently drifting.
            const hoverReact = reduced
              ? 0
              : Math.exp(-distToMouse * 0.18) * Math.sin(distToMouse * 0.6 - t * 9) * 0.5;
            v = Math.max(v, base + hoverReact);
          } else if (letterMask) {
            // carve genuine negative space around the mark -- pure
            // suppression, no added light -- so it emerges from a clearing
            // instead of competing with noise right up to its edges.
            const ldx = x - letterCenterCol;
            const ldy = (y - letterCenterRow) * (cellW / cellH);
            const distToLetters = Math.sqrt(ldx * ldx + ldy * ldy);
            v *= smoothstep(letterClearRadius, letterClearRadius * 2.1, distToLetters);
          }
          v = Math.max(0, Math.min(1, v));

          // ambient cells stay within a narrow mid-density band so the field
          // reads as an even, subtle texture instead of high-contrast
          // speckling; letters alone get to use the full ramp.
          const tier = isLetter ? Math.floor(v * (RAMP.length - 1)) : 1 + Math.floor(v * 4);
          const ch = RAMP[tier];
          const key = tier + (isLetter ? 100 : 0);

          if (key !== runKey) {
            if (runChar) runs.push([runKey, runChar]);
            runChar = ch;
            runKey = key;
          } else {
            runChar += ch;
          }
        }
        if (runChar) runs.push([runKey, runChar]);

        lines.push(
          runs
            .map(function (pair) {
              const key = pair[0];
              const chars = pair[1];
              if (key === null) return chars;
              const isLetter = key >= 100;
              const tier = isLetter ? key - 100 : key;
              const frac = isLetter ? tier / (RAMP.length - 1) : (tier - 1) / 3;
              // letters get a distinctly brighter, near-white band so the
              // mark reads clearly against the dimmer ambient noise floor
              const opacity = isLetter
                ? (0.68 + frac * 0.32).toFixed(2)
                : (0.36 + frac * 0.3).toFixed(2);
              const color = isLetter ? "var(--color-text)" : "inherit";
              return (
                '<span style="opacity:' + opacity + ";color:" + color + '">' + chars + "</span>"
              );
            })
            .join("")
        );
      }

      fieldEl.innerHTML = lines.join("\n");
    }

    let frameCount = 0;
    function frame(now) {
      if (!running) return;
      // render at ~30fps instead of every rAF tick — the noise drift is
      // slow enough that this reads as smooth while halving the CPU cost
      frameCount++;
      if (frameCount % 2 === 0) render(now);
      rafId = window.requestAnimationFrame(frame);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        running = false;
        if (rafId) window.cancelAnimationFrame(rafId);
      } else if (!reduced) {
        running = true;
        rafId = window.requestAnimationFrame(frame);
      }
    });

    if (reduced) {
      render(performance.now());
    } else {
      rafId = window.requestAnimationFrame(frame);
    }
  }

  window.KanasakaHeroAscii = {
    init: init,
  };
})();
