import { errorResponse } from "../../../lib/auth.js";

const LOCAL_FINISH_URL = "http://127.0.0.1:8742/oauth/callback";

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    const message = errorDescription || error;
    return htmlPage(
      "Alpaca connection failed",
      `<p>${escapeHtml(message)}</p><p>Close this tab and return to KS Stocks.</p>`
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return errorResponse("Missing authorization code or state.", 400);
  }

  const local = new URL(LOCAL_FINISH_URL);
  local.searchParams.set("code", code);
  local.searchParams.set("state", state);

  return Response.redirect(local.toString(), 302);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlPage(title, body) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family:sans-serif;padding:2rem">${body}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
