// GET /api/ks-link/config -- what the app needs to know to register an account: the Terms
// version the site currently requires (registration is refused unless the app sends it).
import { jsonResponse } from "../../lib/auth.js";
import { CURRENT_TOS_VERSION } from "../../lib/terms.js";

export async function onRequestGet() {
  return jsonResponse({
    tosVersion: CURRENT_TOS_VERSION,
    termsUrl: "https://kanasaka.com/legal/terms/",
    privacyUrl: "https://kanasaka.com/legal/privacy/",
  });
}
