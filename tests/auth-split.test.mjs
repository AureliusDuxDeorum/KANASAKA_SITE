import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";

import { ROOT } from "./helpers.mjs";

// auth-settings.js only runs on Account Settings and borrows its helpers from auth.js through
// window.KanasakaAuthCore. Load both in a bare VM: a helper that is used but not handed over
// shows up as a missing destructured name (undefined) here.
function stub() {
  const el = () =>
    new Proxy(function () {}, {
      get: (_t, k) => (k === Symbol.toPrimitive ? () => "" : k === "length" ? 0 : el()),
      apply: () => el(),
      set: () => true,
    });
  const win = {
    location: { pathname: "/account/settings/", search: "", href: "" },
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame() {},
    setTimeout,
    fetch: () => Promise.reject(new Error("offline")),
  };
  win.window = win;
  win.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    documentElement: el(),
    body: el(),
    createElement: () => el(),
  };
  return win;
}

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("auth-settings.js receives every shared helper it destructures from auth.js", () => {
  const win = stub();
  const ctx = vm.createContext(win);
  vm.runInContext(read("assets/js/auth.js"), ctx);
  vm.runInContext(read("assets/js/auth-settings.js"), ctx);

  const wanted = read("assets/js/auth-settings.js").match(/const \{([^}]+)\} = core;/)[1].split(",").map((s) => s.trim()).filter(Boolean);
  for (const name of wanted) assert.equal(typeof win.KanasakaAuthCore[name], "function", name);
  assert.equal(typeof win.KanasakaAuthSettings.init, "function");
  win.KanasakaAuth.initSettingsPage();
});

test("only the Account Settings page loads auth-settings.js", () => {
  for (const file of ["index.html", "login/index.html", "account/settings/index.html"]) {
    assert.equal(/auth-settings\.js/.test(read(file)), file === "account/settings/index.html", file);
  }
});
