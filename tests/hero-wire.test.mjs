import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

import { ROOT } from "./helpers.mjs";

// Runs hero-wire.js against a recording canvas stub and returns what it drew.
export function runHero({ width = 1440, height = 900, motion = "full", reduce = false, sessionAgeMin = null, search = "" } = {}) {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get(_t, name) {
        if (name === "measureText") return () => ({ width: 0 });
        return (...args) => calls.push([String(name), ...args]);
      },
      set(_t, name, value) {
        calls.push(["set:" + String(name), value]);
        return true;
      },
    }
  );
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const hudEl = { textContent: "" };
  const listeners = {};
  const heroEl = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    addEventListener: (type, fn) => (listeners[type] = fn),
  };
  const frames = [];
  const win = {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: reduce }),
    requestAnimationFrame: (fn) => frames.push(fn) && frames.length,
    cancelAnimationFrame() {},
    setTimeout() {},
    addEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => "#dfe5eb" }),
    MutationObserver: class { observe() {} },
    KanasakaMeta: { version: "9.9.9" },
  };
  const store = {};
  if (sessionAgeMin !== null) store["kanasaka-session-start"] = String(Date.now() - sessionAgeMin * 60000);
  win.sessionStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)) };
  win.location = { search };
  win.window = win;
  win.document = {
    hidden: false,
    getElementById: (id) => ({ "hero-wire": heroEl, "hw-canvas": canvas, "hw-hud": hudEl })[id] || null,
    documentElement: { getAttribute: (name) => (name === "data-motion" ? motion : null) },
    addEventListener() {},
  };
  const ctxV = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/js/hero-wire.js"), "utf8"), ctxV);
  win.KanasakaHeroWire.init();
  return { calls, frames, hudEl, listeners, store };
}

const count = (calls, name) => calls.filter((c) => c[0] === name).length;

// Steps the animation loop by `ms` and returns one array per frame holding that frame's draw calls.
function stepFrames(run, seconds, stepMs = 50) {
  const frames = [];
  let start = run.calls.length;
  let now = 0;
  for (let t = 0; t < seconds * 1000; t += stepMs) {
    now += stepMs;
    run.frames.shift()(now);
    frames.push(run.calls.slice(start));
    start = run.calls.length;
  }
  return frames;
}

const labels = (calls) => calls.filter((c) => c[0] === "fillText").map((c) => c[1]);

test("hero-wire starts as the tesseract with a tracker and readout", () => {
  const run = runHero();
  const text = labels(run.calls);
  assert.ok(text.includes("//OBJ_01 TESSERACT"));
  assert.ok(text.includes("SEG 320"));
  assert.ok(text.some((t) => /^XW \d/.test(t)));
  assert.ok(text.includes("//TRACK 01 OBJ"));
  assert.equal(run.hudEl.textContent, "//KS_SYS  V9.9.9");
  assert.ok(count(run.calls, "stroke") >= 4);
});

test("one loop runs every stage in order and tracks the four products", () => {
  const run = runHero();
  const seen = [];
  const products = new Set();
  for (const frame of stepFrames(run, 23.5)) {
    for (const text of labels(frame)) {
      const m = text.match(/^\/\/OBJ_01 (\w+)$/);
      if (m && seen[seen.length - 1] !== m[1]) seen.push(m[1]);
      if (/^\/\/OBJ_0[2-5] KS_/.test(text)) products.add(text.slice(9));
    }
  }
  assert.deepEqual(seen.slice(0, 9), ["TESSERACT", "FOLD", "RESOLVE", "KANASAKA", "SPLIT", "FUSE", "REFORM", "UNFOLD", "TESSERACT"]);
  assert.deepEqual([...products].sort(), ["KS_C", "KS_K", "KS_LINK", "KS_UNIFY"]);
});

test("hero-wire never draws a NaN and never jumps between frames, including at the loop point", () => {
  const run = runHero();
  let previous = null;
  let worst = 0;
  for (const frame of stepFrames(run, 47)) {
    for (const call of frame) for (const arg of call.slice(1)) if (typeof arg === "number") assert.ok(Number.isFinite(arg), call[0]);
    // segments are drawn grouped by depth, so compare the shape as a whole: its box and centroid
    const pts = frame.filter((c) => c[0] === "moveTo" || c[0] === "lineTo").slice(0, 640);
    const xs = pts.map((c) => c[1]);
    const ys = pts.map((c) => c[2]);
    const now = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), xs.reduce((a, b) => a + b) / xs.length, ys.reduce((a, b) => a + b) / ys.length];
    if (previous) now.forEach((v, i) => (worst = Math.max(worst, Math.abs(v - previous[i]))));
    previous = now;
  }
  assert.ok(worst < 80, "largest jump of the shape between two frames: " + worst.toFixed(0) + "px");
});

test("hero-wire with motion off draws one still frame of the mark and never loops", () => {
  const { frames, calls } = runHero({ motion: "off" });
  assert.equal(frames.length, 0);
  assert.ok(labels(calls).includes("//OBJ_01 KANASAKA"));
  assert.equal(count(calls, "clearRect"), 1, "one render, at the first measure");
});

test("hero-wire uses short centred labels on a phone", () => {
  const run = runHero({ width: 390, height: 780 });
  const names = new Set();
  for (const frame of stepFrames(run, 18.6)) for (const t of labels(frame)) if (/^\/\/KS_/.test(t)) names.add(t);
  assert.deepEqual([...names].sort(), ["//KS_C", "//KS_K", "//KS_LINK", "//KS_UNIFY"]);
});

test("hero-wire survives pointer movement", () => {
  const run = runHero();
  run.listeners.pointermove({ pointerType: "mouse", clientX: 700, clientY: 400 });
  stepFrames(run, 1);
  run.listeners.pointerleave();
  stepFrames(run, 1);
});

// ── easter egg: the words, once the session is 10 minutes old ───────────────────────────────
function stages(run, seconds) {
  const seen = [];
  for (const frame of stepFrames(run, seconds)) {
    for (const text of labels(frame)) {
      const m = text.match(/^\/\/OBJ_01 (\w+)$/);
      if (m && seen[seen.length - 1] !== m[1]) seen.push(m[1]);
    }
  }
  return seen;
}

test("egg: a session under 10 minutes never shows the words", () => {
  const run = runHero({ sessionAgeMin: 9 });
  assert.ok(!stages(run, 50).includes("EVOLUTION"));
});

test("egg: after 10 minutes the words replace the next tesseract, hold 10 s, then the loop goes on", () => {
  const run = runHero({ sessionAgeMin: 11 });
  const seen = stages(run, 40);
  assert.deepEqual(seen.slice(0, 4), ["EVOLUTION", "TESSERACT", "FOLD", "RESOLVE"]);
  assert.equal(run.store["kanasaka-egg-shown"], "1");
});

test("egg: shown once per session, and held for 10 seconds", () => {
  const run = runHero({ sessionAgeMin: 11 });
  let holdFrames = 0;
  let again = 0;
  for (const frame of stepFrames(run, 60)) {
    const here = labels(frame).some((t) => t === "//OBJ_01 EVOLUTION");
    if (here) holdFrames += 1;
  }
  // 13.2 s on screen in total at 50 ms a frame (10 s hold + 1.6 s each way)
  assert.ok(holdFrames >= 255 && holdFrames <= 270, "frames showing EVOLUTION: " + holdFrames);
  for (const frame of stepFrames(run, 30)) if (labels(frame).includes("//OBJ_01 EVOLUTION")) again += 1;
  assert.equal(again, 0, "it does not come back");
});

test("egg: ?egg shows it straight away; motion off never does", () => {
  assert.ok(labels(runHero({ search: "?egg" }).calls).includes("//OBJ_01 EVOLUTION"));
  assert.ok(!labels(runHero({ search: "?egg", motion: "off" }).calls).includes("//OBJ_01 EVOLUTION"));
});

test("egg: the shape stays smooth into and out of the words, and the loop resumes where it stopped", () => {
  const run = runHero({ sessionAgeMin: 11, width: 390, height: 780 });
  let previous = null;
  let worst = 0;
  for (const frame of stepFrames(run, 40)) {
    for (const call of frame) for (const arg of call.slice(1)) if (typeof arg === "number") assert.ok(Number.isFinite(arg), call[0]);
    const pts = frame.filter((c) => c[0] === "moveTo" || c[0] === "lineTo").slice(0, 640);
    const xs = pts.map((c) => c[1]);
    const ys = pts.map((c) => c[2]);
    const now = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (previous) now.forEach((v, i) => (worst = Math.max(worst, Math.abs(v - previous[i]))));
    previous = now;
  }
  assert.ok(worst < 80, "largest jump: " + worst.toFixed(0) + "px");
});
