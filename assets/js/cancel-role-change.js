// Landing page for the "cancel this role change" link in the pending-role-
// change email. Lives in its own file because the site CSP (script-src 'self')
// blocks inline scripts. The token in the URL is the credential; the server
// decides what it does.
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function () {
    const status = document.getElementById("cancel-role-status");
    if (!status) return;

    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      status.textContent = "This link is missing its token.";
      return;
    }

    try {
      const response = await fetch("/api/admin/cancel-role-change?token=" + encodeURIComponent(token), {
        method: "GET",
        credentials: "include",
      });
      const data = await response.json();
      status.textContent = (data && data.message) || "Something went wrong.";
    } catch {
      status.textContent = "Could not reach the server. Try again shortly.";
    }
  });
})();
