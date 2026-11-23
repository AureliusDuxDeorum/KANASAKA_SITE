// /api/media/<name>: films streamed from R2 with Range support.
import assert from "node:assert/strict";
import { test } from "node:test";

import { onRequestGet, onRequestHead } from "../functions/api/media/[[catchall]].js";

const BYTES = Buffer.from("0123456789");
const bucket = {
  async head(key) {
    return key === "media/videos/film.mp4" ? { size: BYTES.length, httpEtag: '"e"' } : null;
  },
  async get(key, opts) {
    if (key !== "media/videos/film.mp4") return null;
    const r = opts && opts.range;
    return { body: r ? BYTES.subarray(r.offset, r.offset + r.length) : BYTES };
  },
};
const call = (fn, name, headers = {}) =>
  fn({ request: new Request("https://x.test/api/media/" + name, { headers }), env: { INSTALLERS: bucket }, params: { catchall: [name] } });

test("a whole file is served as video/mp4 with ranges advertised", async () => {
  const res = await call(onRequestGet, "film.mp4");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "video/mp4");
  assert.equal(res.headers.get("Accept-Ranges"), "bytes");
  assert.equal(res.headers.get("Content-Length"), "10");
});

test("ranges: bounded, open-ended and suffix answer 206 with Content-Range", async () => {
  for (const [range, expect, body] of [["bytes=2-4", "bytes 2-4/10", "234"], ["bytes=7-", "bytes 7-9/10", "789"], ["bytes=-3", "bytes 7-9/10", "789"]]) {
    const res = await call(onRequestGet, "film.mp4", { Range: range });
    assert.equal(res.status, 206, range);
    assert.equal(res.headers.get("Content-Range"), expect);
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), body);
  }
});

test("an unsatisfiable range is 416", async () => {
  const res = await call(onRequestGet, "film.mp4", { Range: "bytes=50-60" });
  assert.equal(res.status, 416);
  assert.equal(res.headers.get("Content-Range"), "bytes */10");
});

test("HEAD has no body; unknown or odd names are 404", async () => {
  const head = await call(onRequestHead, "film.mp4");
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  for (const name of ["nope.mp4", "../film.mp4", "FILM.mp4", "film.exe"]) {
    assert.equal((await call(onRequestGet, name)).status, 404, name);
  }
});
