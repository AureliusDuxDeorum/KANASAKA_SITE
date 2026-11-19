// POST /api/app/two-factor-send -- "email me a code instead", during the second sign-in step. Identical to the website's
// /api/auth/two-factor-send (it sets no cookie and the challenge is all it needs); this path exists so a native app stays on /api/app/.
export { onRequestPost } from "../auth/two-factor-send.js";
