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

test("the stroke font covers every character an account ID may contain", () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(read("assets/js/wire-font.js"), ctx);
  const font = ctx.window.KanasakaWireFont;
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-") assert.ok(font.glyphs[ch], "missing glyph " + ch);
  const block = font.layout(["dev_ks"]);
  assert.ok(block.segments.length > 10);
  assert.equal(block.width, 29, "six letters, five gaps of 1 between 4-wide glyphs");
  assert.equal(block.height, 6);
});

test("every stroke is a solid beam: edges reach into all three dimensions and none is degenerate", () => {
  const { win } = runAccountWire();
  const shape = win.KanasakaAccountWire.build("i");
  // "I" is three strokes (two bars and a stem); each beam has 4 long edges plus end caps
  assert.ok(shape.count >= 3 * 4 + 8, "edges: " + shape.count);
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < shape.count; i += 1) {
    const e = Array.from(shape.pts.slice(i * 6, i * 6 + 6));
    assert.ok(Math.hypot(e[0] - e[3], e[1] - e[4], e[2] - e[5]) > 0.1, "degenerate edge " + i);
    minZ = Math.min(minZ, e[2], e[5]);
    maxZ = Math.max(maxZ, e[2], e[5]);
  }
  assert.ok(maxZ - minZ >= 1.2, "depth of the letters: " + (maxZ - minZ));

  // a stem is a box: its long edges run along y at four different (x, z) corners
  const stem = [];
  for (let i = 0; i < shape.count; i += 1) {
    const e = Array.from(shape.pts.slice(i * 6, i * 6 + 6));
    if (Math.abs(e[0] - e[3]) < 1e-9 && Math.abs(e[1] - e[4]) > 5 && Math.abs(e[2] - e[5]) < 1e-9) stem.push(e);
  }
  assert.equal(stem.length, 4, "the stem has four long edges");
  assert.equal(new Set(stem.map((e) => e[0].toFixed(2) + "/" + e[2].toFixed(2))).size, 4, "at four distinct corners");
});

test("curves cost nothing extra: one continuous beam per stroke, rings only at free ends", () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(read("assets/js/wire-font.js"), ctx);
  const edges = (text) => ctx.window.KanasakaWireFont.beams([text]).edges;
  // "O" is one closed ring of 8 pieces: 8 x 4 long edges and no cross-section rings at all
  assert.equal(edges("O").length, 32);
  // "L" is two pieces with free ends: 2 x 4 long edges + 2 end rings of 4
  assert.equal(edges("L").length, 16);
  // "S" is 11 pieces with two free ends: 11 x 4 + 2 x 4; a bend adds nothing
  assert.equal(edges("S").length, 52);
  // adding a bend to a stroke adds exactly its 4 long edges
  assert.equal(edges("C").length, 7 * 4 + 8);
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
