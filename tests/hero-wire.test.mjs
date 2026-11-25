import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

import { ROOT } from "./helpers.mjs";

// Runs hero-wire.js against a recording canvas stub and returns what it drew.
export function runHero({ width = 1440, height = 900, motion = "full", reduce = false } = {}) {
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
  return { calls, frames, hudEl, listeners };
}

const count = (calls, name) => calls.filter((c) => c[0] === name).length;

test("hero-wire draws every solid with edges, brackets and labels", () => {
  const { calls, hudEl } = runHero();
  assert.ok(count(calls, "stroke") >= 5, "edges and tracking strokes");
  assert.ok(count(calls, "fillText") >= 10, "labels");
  const text = calls.filter((c) => c[0] === "fillText").map((c) => c[1]);
  assert.ok(text.includes("//OBJ_01 ICOSA"));
  assert.ok(text.some((t) => /^V12 E30$/.test(t)), "icosahedron has 12 vertices and 30 edges");
  assert.ok(text.some((t) => /^V8 E12$/.test(t)), "cube has 8 vertices and 12 edges");
  assert.ok(text.some((t) => /^V6 E12$/.test(t)), "octahedron has 6 vertices and 12 edges");
  assert.ok(text.some((t) => /^V4 E6$/.test(t)), "tetrahedron has 4 vertices and 6 edges");
  assert.equal(hudEl.textContent, "//KS_SYS  V9.9.9");
});

test("hero-wire animates: frames keep being scheduled and drawn", () => {
  const { frames, calls } = runHero();
  assert.equal(frames.length, 1);
  const before = count(calls, "clearRect");
  frames.shift()(16);
  frames.shift()(32);
  assert.ok(count(calls, "clearRect") > before);
  assert.equal(frames.length, 1, "the loop reschedules itself");
});

test("hero-wire with motion off draws one still frame and never schedules a loop", () => {
  const { frames, calls } = runHero({ motion: "off" });
  assert.equal(frames.length, 0);
  assert.equal(count(calls, "clearRect"), 2, "resize + the still render");
  assert.ok(count(calls, "stroke") >= 5);
});

test("hero-wire shows three objects on a phone", () => {
  const { calls } = runHero({ width: 390, height: 780 });
  const names = calls.filter((c) => c[0] === "fillText" && /^\/\/OBJ_/.test(c[1])).map((c) => c[1]);
  assert.equal(new Set(names).size, 3, "icosa, torus and cube on a phone");
});

test("hero-wire survives pointer movement", () => {
  const { listeners, frames } = runHero();
  listeners.pointermove({ pointerType: "mouse", clientX: 700, clientY: 400 });
  frames.shift()(16);
  listeners.pointerleave();
});
