(function () {
  const RAMP = " .:-=+*#%@";
  const CELL_W = 7.8;
  const CELL_H = 18;
  const MASK_SCALE = 4;

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
      if (col.head) rows.push('<span class="ha-head">' + col.head + "</span>");
      col.lines.forEach(function (l) {
        rows.push('<span class="' + l.cls + '">' + l.t + "</span>");
      });
      div.innerHTML = rows.join("\n");
      colsEl.appendChild(div);
    });
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
      mctx.textBaseline = "middle";

      const fieldStartPx = startCol * MASK_SCALE;
      const fieldW = mw - fieldStartPx;
      const fieldCenterX = fieldStartPx + fieldW / 2;
      const letterSize = mh * 0.58;
      mctx.font = '600 ' + letterSize + 'px "Tektur", ui-monospace, monospace';
      mctx.fillText("K", fieldCenterX - letterSize * 0.4, mh * 0.32);
      mctx.fillText("S", fieldCenterX + letterSize * 0.4, mh * 0.7);

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
      const wrapRect = fieldWrap.getBoundingClientRect();
      const colsRect = colsEl.getBoundingClientRect();
      contentColsWidth = colsRect.width + 24;
      cols = Math.floor(wrapRect.width / CELL_W);
      rows = Math.floor(wrapRect.height / CELL_H);
      startCol = Math.ceil(contentColsWidth / CELL_W) + 2;
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
        let runTier = -1;
        const runs = [];

        for (let x = 0; x < cols; x++) {
          if (x < startCol) {
            runChar += " ";
            continue;
          }

          const dx = x - mx;
          const dy = (y - my) * (CELL_W / CELL_H);
          const distToMouse = Math.sqrt(dx * dx + dy * dy);
          const ripple = reduced
            ? 0
            : Math.exp(-distToMouse * 0.06) * Math.sin(distToMouse * 0.35 - t * 2.2) * 0.35;

          const nx = x * 0.09 + (reduced ? 0 : t * 0.06);
          const ny = y * 0.16 - (reduced ? 0 : t * 0.04);
          let v = fbm(nx, ny) + ripple;

          const m = letterMask ? letterMask[y * cols + x] : 0;
          if (m > 0.05) {
            v = Math.max(v, m * (0.72 + fbm(nx * 1.7 + 9.0, ny * 1.7 + 4.0) * 0.35));
          }

          v = Math.max(0, Math.min(1, v));
          const tier = Math.floor(v * (RAMP.length - 1));
          const ch = RAMP[tier];

          if (tier !== runTier) {
            if (runChar) runs.push([runTier, runChar]);
            runChar = ch;
            runTier = tier;
          } else {
            runChar += ch;
          }
        }
        if (runChar) runs.push([runTier, runChar]);

        lines.push(
          runs
            .map(function (pair) {
              const tier = pair[0];
              const chars = pair[1];
              if (tier < 0) return chars;
              const opacity = (0.12 + (tier / (RAMP.length - 1)) * 0.75).toFixed(2);
              return '<span style="opacity:' + opacity + '">' + chars + "</span>";
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
