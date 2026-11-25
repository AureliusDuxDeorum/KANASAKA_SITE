import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

import { ROOT } from "./helpers.mjs";

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

// Runs the font and account-wire.js against a recording canvas stub.
export function runAccountWire({ width = 700, height = 800, motion = "full", id = null } = {}) {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => (...args) => calls.push([String(name), ...args]),
      set(_t, name, value) {
        calls.push(["set:" + String(name), value]);
        return true;
      },
    }
  );
  const host = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    addEventListener() {},
  };
  const canvas = { width: 0, height: 0, parentElement: host, getContext: () => ctx };
  const frames = [];
  const win = {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (fn) => frames.push(fn) && frames.length,
    cancelAnimationFrame() {},
    addEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => "#dfe5eb" }),
    MutationObserver: class { observe() {} },
  };
  win.window = win;
  win.document = {
    hidden: false,
    readyState: "complete",
    getElementById: (name) => (name === "settings-wire" ? canvas : null),
    documentElement: { getAttribute: (name) => (name === "data-motion" ? motion : null) },
    addEventListener() {},
  };
  const context = vm.createContext(win);
  vm.runInContext(read("assets/js/wire-font-outlines.js"), context);
  vm.runInContext(read("assets/js/wire-font.js"), context);
  vm.runInContext(read("assets/js/account-wire.js"), context);
  if (id !== null) win.KanasakaAccountWire.set(id);
  return { calls, frames, win };
}

const labels = (calls) => calls.filter((c) => c[0] === "fillText").map((c) => c[1]);

function stepFrames(run, seconds, stepMs = 50) {
  const out = [];
  let start = run.calls.length;
  let now = 0;
  for (let t = 0; t < seconds * 1000; t += stepMs) {
    now += stepMs;
    run.frames.shift()(now);
    out.push(run.calls.slice(start));
    start = run.calls.length;
  }
  return out;
}

function loadFont() {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(read("assets/js/wire-font-outlines.js"), ctx);
  vm.runInContext(read("assets/js/wire-font.js"), ctx);
  return { font: ctx.window.KanasakaWireFont, data: ctx.window.KanasakaWireFontData };
}

test("the font covers every character an account ID may contain", () => {
  const { font } = loadFont();
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-") assert.ok(font.glyphs[ch], "missing glyph " + ch);
  const block = font.layout(["dev_ks"]);
  assert.equal(block.items.length, 6);
  assert.equal(block.height, 6);
  assert.ok(block.width > 20 && block.width < 40, "width " + block.width);
});

test("letters are extruded outlines: front, back and edges between them, in all three dimensions", () => {
  const { win } = runAccountWire();
  const shape = win.KanasakaAccountWire.build("i");
  // "I" is a plain 4-cornered outline: 4 front + 4 back + 4 connecting edges, one per corner
  assert.equal(shape.count, 12);
  let minZ = Infinity;
  let maxZ = -Infinity;
  let connectors = 0;
  for (let i = 0; i < shape.count; i += 1) {
    const e = Array.from(shape.pts.slice(i * 6, i * 6 + 6));
    assert.ok(Math.hypot(e[0] - e[3], e[1] - e[4], e[2] - e[5]) > 0.1, "degenerate edge " + i);
    minZ = Math.min(minZ, e[2], e[5]);
    maxZ = Math.max(maxZ, e[2], e[5]);
    if (Math.abs(e[0] - e[3]) < 1e-9 && Math.abs(e[1] - e[4]) < 1e-9 && e[2] !== e[5]) connectors += 1;
  }
  assert.ok(maxZ - minZ >= 1.1, "depth of the letters: " + (maxZ - minZ));
  assert.equal(connectors, 4);
});

test("letters are angular: curves are cut to a few facets and every connecting edge sits at a corner", () => {
  const { font, data } = loadFont();
  const turn = (a, b) => {
    const dot = a[0] * b[0] + a[1] * b[1];
    return (Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...b))))) * 180) / Math.PI;
  };
  for (const [ch, [, contours]] of Object.entries(data.glyphs)) {
    const expected = contours.reduce((sum, [pts, marks]) => sum + 2 * (pts.length / 2) + marks.length, 0);
    assert.equal(font.solid([ch]).edges.length, expected, ch);
    for (const [flat, marks] of contours) {
      const n = flat.length / 2;
      assert.ok(n <= 20, ch + " has " + n + " vertices on a loop: curves must be cut to facets");
      if (marks.length === 2) continue; // a smooth loop, held together by its two silhouette edges
      for (const k of marks) {
        const p = (i) => [flat[((i + n) % n) * 2], flat[((i + n) % n) * 2 + 1]];
        const a = p(k - 1);
        const b = p(k);
        const c = p(k + 1);
        assert.ok(turn([b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]) > 15, ch + ": a connecting edge on a straight stretch");
      }
    }
  }
  // the O is a rectangle ring: two 4-cornered loops with a connecting edge at every corner
  const shape = (ch) => JSON.stringify(data.glyphs[ch][1].map(([pts, marks]) => [pts.length / 2, marks.length]));
  assert.equal(shape("O"), "[[4,4],[4,4]]");
  // the K is the K of the KS logo: its outline (17 corners) and the small counter by the foot (4)
  assert.equal(shape("K"), "[[17,17],[4,4]]");
  const kx = data.glyphs.K[1][0][0].filter((_, i) => i % 2 === 0);
  assert.ok(Math.max(...kx) - Math.min(...kx) > 650, "the K keeps the logo's wide proportions");
  assert.ok(data.glyphs.S[1][0][0].length / 2 <= 20, "an S is a few facets, not 74 points");
});

test("without an ID the void says so instead of drawing nothing", () => {
  const run = runAccountWire();
  assert.ok(labels(run.calls).includes("//ACC_ID  ----"));
});

test("the ID builds on letter by letter, then is tracked with a label", () => {
  const run = runAccountWire({ id: "dev_ks" });
  const strokes = stepFrames(run, 4).map((frame) => frame.filter((c) => c[0] === "lineTo").length);
  assert.ok(strokes[3] < strokes[strokes.length - 1], "more edges are drawn as it builds");
  const text = labels(run.calls);
  assert.ok(text.includes("//ACC_ID"));
  assert.ok(text.includes("LEN 06"));
  assert.ok(text.some((t) => /^RY \d/.test(t)));
});

test("setting a new ID rebuilds it; very long IDs wrap and stay finite", () => {
  const run = runAccountWire({ id: "dev_ks" });
  stepFrames(run, 3);
  run.win.KanasakaAccountWire.set("a".repeat(32));
  for (const frame of stepFrames(run, 5)) {
    for (const call of frame) for (const arg of call.slice(1)) if (typeof arg === "number") assert.ok(Number.isFinite(arg), call[0]);
  }
  assert.ok(labels(run.calls).includes("LEN 32"));
});

test("with motion off the finished ID is drawn once and never animates", () => {
  const run = runAccountWire({ motion: "off", id: "dev_ks" });
  assert.equal(run.frames.length, 0);
  assert.ok(labels(run.calls).includes("LEN 06"));
});

test("an ID handed over before the canvas exists is shown once it does", () => {
  const ctx = vm.createContext({ window: {}, document: { readyState: "complete", getElementById: () => null, addEventListener() {} } });
  vm.runInContext(read("assets/js/account-wire.js"), ctx);
  ctx.window.KanasakaAccountWire.set("Early_Bird");
  assert.ok(ctx.window.KanasakaAccountWire.init);
});

test("only the Account Settings page loads the account wire", () => {
  for (const file of ["index.html", "login/index.html", "account/settings/index.html"]) {
    assert.equal(/account-wire\.js/.test(read(file)), file === "account/settings/index.html", file);
  }
});
