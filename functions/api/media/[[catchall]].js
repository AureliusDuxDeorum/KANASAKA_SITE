import { errorResponse } from "../../lib/auth.js";

// Videos served from R2 (bucket kanasaka-installers, binding INSTALLERS), under
// media/videos/. Pages caps a static file at 25 MiB, which a full-quality film
// exceeds, so the films live in R2 and this streams them, with Range support so
// a browser can start playing and seek without downloading the whole file.
//
// Public and unauthenticated, like the installer downloads. Only plain
// lowercase file names are served, so a request can never name another key.
// Upload with scripts/publish-video.mjs.
const NAME = /^[a-z0-9][a-z0-9-]{0,63}\.(mp4|webm)$/;
const TYPES = { mp4: "video/mp4", webm: "video/webm" };

// "bytes=a-b", "bytes=a-" or "bytes=-n" -> { offset, length } | null (unsatisfiable)
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start;
  let end;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (!n) return null;
    start = Math.max(size - n, 0);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return null;
  return { offset: start, length: end - start + 1 };
}

async function serve(context, withBody) {
  const { request, env, params } = context;
  const slug = Array.isArray(params.catchall) ? params.catchall.join("/") : String(params.catchall || "");

  if (!env.INSTALLERS) return errorResponse("Media is not configured.", 503);
  if (!NAME.test(slug)) return errorResponse("Not found.", 404);

  const key = "media/videos/" + slug;
  const head = await env.INSTALLERS.head(key);
  if (!head) return errorResponse("Not found.", 404);

  const headers = new Headers();
  headers.set("Content-Type", TYPES[slug.split(".").pop()]);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("ETag", head.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");

  const rangeHeader = request.headers.get("Range");
  if (!rangeHeader) {
    headers.set("Content-Length", String(head.size));
    if (!withBody) return new Response(null, { status: 200, headers });
    const object = await env.INSTALLERS.get(key);
    if (!object) return errorResponse("Not found.", 404);
    return new Response(object.body, { status: 200, headers });
  }

  const range = parseRange(rangeHeader, head.size);
  if (!range) {
    headers.set("Content-Range", `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
  headers.set("Content-Length", String(range.length));
  if (!withBody) return new Response(null, { status: 206, headers });
  const object = await env.INSTALLERS.get(key, { range });
  if (!object) return errorResponse("Not found.", 404);
  return new Response(object.body, { status: 206, headers });
}

export const onRequestGet = (context) => serve(context, true);
export const onRequestHead = (context) => serve(context, false);
