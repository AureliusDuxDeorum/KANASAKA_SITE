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
  function fbm(x, y) {
    let v = 0, a = 0.5, xx = x, yy = y;
    for (let i = 0; i < 4; i++) {
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
        { t: "KS Unify", cls: "ha-item" },
        { t: "KS Stocks", cls: "ha-item" },
        { t: "KS-K Mobile", cls: "ha-item" },
        { t: "Robotics", cls: "ha-item" },
      ],
    },
    {
      head: "Research",
      lines: [
        { t: "AI", cls: "ha-item" },
        { t: "Robotics", cls: "ha-item" },
        { t: "Publications", cls: "ha-item" },
        { t: "Future work", cls: "ha-item" },
      ],
    },
    {
      head: "Company",
      lines: [
        { t: "About", cls: "ha-item" },
        { t: "Vision", cls: "ha-item" },
        { t: "Leadership", cls: "ha-item" },
        { t: "News", cls: "ha-item" },
        { t: "Careers", cls: "ha-item" },
      ],
    },
    {
      head: "Developers",
      lines: [
        { t: "API", cls: "ha-item" },
        { t: "SDK", cls: "ha-item" },
        { t: "GitHub", cls: "ha-item" },
        { t: "Docs", cls: "ha-item" },
      ],
    },
  ];

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
        rows.push('<span class="' + l.cls + '">' + l.t + "</span>");
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
      const fieldCenterX = fieldStartPx + fieldW / 2;
      // sized/positioned with margin so ascenders/descenders never clip
      // against the field bounds, K stacked above S like the wordmark,
      // shifted up slightly off dead-center for a less static composition.
      const letterSize = mh * 0.46;
      const yOffset = -mh * 0.05;
      mctx.font = '600 ' + letterSize + 'px "Tektur", ui-monospace, monospace';
      mctx.fillText("K", fieldCenterX, mh * 0.43 + yOffset);
      mctx.fillText("S", fieldCenterX, mh * 0.85 + yOffset);

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
            : Math.exp(-distToMouse * 0.06) * Math.sin(distToMouse * 0.35 - t * 2.2) * 0.35;

          const nx = x * 0.09 + (reduced ? 0 : t * 0.06);
          const ny = y * 0.16 - (reduced ? 0 : t * 0.04);
          let v = fbm(nx, ny) + ripple;

          const m = letterMask ? letterMask[y * cols + x] : 0;
          const isLetter = m > 0.1;
          if (isLetter) {
            v = Math.max(v, m * (0.7 + fbm(nx * 1.7 + 9.0, ny * 1.7 + 4.0) * 0.35));
          }
          v = Math.max(0, Math.min(1, v));

          const tier = Math.floor(v * (RAMP.length - 1));
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
              const frac = tier / (RAMP.length - 1);
              // letters get a distinctly brighter, near-white band so the
              // mark reads clearly against the dimmer ambient noise floor
              const opacity = isLetter
                ? (0.68 + frac * 0.32).toFixed(2)
                : (0.45 + frac * 0.55).toFixed(2);
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

    function frame(now) {
      if (!running) return;
      render(now);
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
